/*eslint global-require:off */

const glov_local_storage = require('./glov/local_storage.js');
glov_local_storage.storage_prefix = 'LD44';

const glov_camera = require('./glov/camera2d.js');
const glov_engine = require('./glov/engine.js');
const glov_input = require('./glov/input.js');
const glov_terminal = require('./glov/terminal.js');
const glov_ui = require('./glov/ui.js');
// const fs = require('fs');

const { floor, min, random, round } = Math;

// Virtual viewport for our game logic
export const game_width = 720;
export const game_height = 400;

export function main() {
  if (!glov_engine.startup({
    game_width,
    game_height,
    pixely: 'strict',
    viewport_postprocess: true,
    font: {
      info: require('./img/font/vga_16x1.json'),
      texture: 'font/vga_16x1',
    },
    pixel_aspect: (640/480) / (720 / 400),
    show_fps: false,
  })) {
    return;
  }

  const terminal = glov_terminal.create();
  terminal.baud = 9600;

  // Perfect sizes for pixely modes
  glov_ui.scaleSizes(13 / 32);
  glov_ui.setFontHeight(16);

  // Cache KEYS
  const KEYS = glov_input.KEYS;

  let character = {
    hp: 50,
    maxhp: 100,
    hit_chance: 75,
    damage_base: 5,
    damage_range: 5,
    damage_reduction: 0,
    // critical_chance: 10,
    // critical_mult: 4,
    initiative: 50,
    upgrades: 0,
  };

  let enemy;

  function pak() {
    return glov_input.keyDownEdge(KEYS.SPACE) || glov_input.keyDownEdge(KEYS.ENTER) ||
      glov_input.keyDownEdge(KEYS.ESC) || glov_input.click();
  }

  function pakDisplay() {
    terminal.normal();
    terminal.print({ x: (80 - 26)/2, y: 24, text: 'Press [1;37mSPACE[0m to continue...' });
  }

  function pakClear() {
    terminal.normal();
    terminal.fill({ x: (80 - 26)/2, y: 24, w: 26, h: 1 });
  }

  const MENU_W = 30;
  const MENU_X = (80 - MENU_W) / 2;
  const MENU_Y = 8;

  const MENU_KILLING_W = 40;
  const MENU_KILLING_X = (80 - MENU_KILLING_W) / 2;
  const MENU_KILLING_Y = 8;

  const MENU_SHOP_X = 45;
  const MENU_SHOP_Y = 14;


  const AFTER_MENU_X = 4;
  const AFTER_MENU_Y = 16;

  function statusDisplay() {
    const BAR_W = 30;
    let bar = [];
    let solid = round(character.hp / character.maxhp * BAR_W * 2) / 2;
    if (character.hp && !solid) {
      solid = 0.5;
    }
    let rem = 2 * (solid - floor(solid));
    solid = floor(solid);
    if (solid <= 2) {
      bar.push('[5m');
    }
    for (let ii = 0; ii < solid; ++ii) {
      bar.push('█');
    }
    if (rem) {
      bar.push('▌');
    }
    if (solid <= 2) {
      bar.push('[0;1;31;41m');
    }
    bar.push('[30m');
    for (let ii = 0; ii < BAR_W - solid - rem; ++ii) {
      bar.push('░');
    }
    terminal.print({
      x: 80 - BAR_W - 'LIFE: '.length - 1,
      y: 0,
      fg: 4+8, bg: 0,
      text: `LIFE: [41m${bar.join('')}\r\n`,
    });
    terminal.normal();
  }

  function rand100() {
    return floor(random() * 100);
  }

  function status(char) {
    return [
      `LIFE: ${char.hp} / ${char.maxhp}`,
      // `Attack (${char.hit_chance}%): ${char.damage_base}-${character.damage_base+character.damage_range}`,
    ];
  }

  const MENU_FIGHT_Y = 25 - 4;

  function pakThen(f) {
    let pos = [terminal.x, terminal.y];
    pakDisplay();
    glov_engine.setState(() => {
      if (pak()) {
        pakClear();
        terminal.moveto(pos[0], pos[1]);
        f();
      }
    });
  }

  function delayThen(timeout, f) {
    glov_engine.setState(function () {
      // nothing
    });
    setTimeout(f, timeout);
  }

  function gameOver(idx) {
    if (!idx) {
      terminal.clear();
      terminal.print({ fg: 7, x: 25, y: 10, text: '        You have died.' });
      pakThen(gameOver.bind(null, 1));
    } else if (idx === 1) {
      terminal.print({ fg: 8, x: 25, y: 10, text: '        You have died.' });
      terminal.print({ fg: 7, x: 25, y: 12, text: 'You were probably just unlucky.' });
      pakThen(gameOver.bind(null, 2));
    } else if (idx === 2) {
      terminal.print({ fg: 8, x: 25, y: 12, text: 'You were probably just unlucky.' });
      terminal.print({ fg: 7, x: 25, y: 14, text: '      Thanks for playing!' });
      pakThen(gameOver.bind(null, 3));
    } else if (idx === 3) {
      terminal.print({ fg: 8, x: 25, y: 14, text: '      Thanks for playing!' });
      terminal.print({ fg: 7, x: 25, y: 16, text: '     Reload to try again.' });
    }
  }

  function loot() {
    let loot_amount = min(character.maxhp - character.hp, enemy.loot);
    character.hp += loot_amount;
    terminal.print({ fg: 6+8, text: '          You feast on the flesh of your slain enemy, drinking\r\n' +
      `          of its essence, absoring [1;31m${loot_amount} LIFE[33m, bringing you up to\r\n` +
      `          ${character.hp} / ${character.maxhp} LIFE.\r\n\r\n` });
    delayThen(1000, () => {
      pakThen(killingFieldsInit);
    });
  }

  function doEnemyAttack() {
    let hit = rand100() < enemy.hit_chance;
    if (hit) {
      let damage = round((enemy.damage_base + random() * enemy.damage_range) * (1 - character.damage_reduction));
      terminal.print({
        fg: 4+8,
        text: `It hits you for ${damage} points of damage`,
      });
      character.hp -= damage;
      if (character.hp <= 0) {
        terminal.print({ text: ', killing you.\r\n\r\n' });
        pakThen(gameOver);
      } else {
        terminal.print({ text: '.\r\n\r\n' });
        pakThen(doPlayerAction);
      }
    } else {
      terminal.print({
        fg: 2+8,
        text: 'It MISSES.\r\n\r\n',
      });
      pakThen(doPlayerAction);
    }
  }

  function playerActionMenu() {
    let sel = terminal.menu({
      x: MENU_X,
      y: MENU_FIGHT_Y,
      items: [
        'Attack ',
        'Bravely run away ',
        'Status ',
      ],
    });
    terminal.moveto(0, 24);

    switch (sel) { // eslint-disable-line default-case
      case 0: {
        terminal.crlf();
        let hit = rand100() < character.hit_chance;
        if (hit) {
          let damage = round(character.damage_base + random() * character.damage_range);
          let was_bloodied = enemy.hp < enemy.maxhp * 0.5;
          terminal.print({
            fg: 2+8,
            text: `You hit for ${damage} pts of damage`,
          });
          enemy.hp -= damage;
          let is_bloodied = enemy.hp < enemy.maxhp * 0.5;
          if (enemy.hp <= 0) {
            terminal.print({ text: ', killing it.\r\n\r\n' });
            pakThen(loot);
          } else {
            if (is_bloodied && !was_bloodied) {
              terminal.print({ text: ', bloodying it.\r\n\r\n' });
            } else if (!is_bloodied) {
              terminal.print({ text: ', but it still stands strong.\r\n\r\n' });
            } else {
              terminal.print({ text: '.  It bleeds.\r\n\r\n' });
            }
            pakThen(doEnemyAttack);
          }
        } else {
          terminal.print({
            fg: 4+8,
            text: 'You MISS.\r\n\r\n',
          });
          pakThen(doEnemyAttack);
        }
      } break;
      case 1: // retreat
        terminal.crlf();
        terminal.print({ text: `Feeling suddenly pacifistic, you leave the ${enemy.name} alone...\r\n` +
          '... for now.\r\n\r\n\r\n' });
        pakThen(killingFieldsInit);
        break;
      case 2: { // status
        let player_lines = status(character);
        let enemy_lines = status(enemy);
        terminal.crlf();
        for (let ii = 0; ii < player_lines.length; ++ii) {
          terminal.print({
            x: 12,
            y: 24,
            text: player_lines[ii],
          });
          terminal.print({
            x: 42,
            y: 24,
            text: enemy_lines[ii],
          });
          terminal.crlf();
        }
        terminal.crlf();
        terminal.cells({
          x: 10, y: 24 - player_lines.length - 2, ws: [29, 29], hs: [player_lines.length], charset: 3,
          header: ['PLAYER STATUS', 'ENEMY STATUS'],
        });
        doPlayerAction();
      } break;
    }
  }

  let title_idx = 0;
  function doPlayerAction() {
    terminal.normal();
    for (let ii = 0; ii < 5; ++ii) {
      terminal.crlf(); // scroll to make room for menu
    }

    let n = enemy.name.toUpperCase();
    terminal.cells({
      x: MENU_X - 2, y: MENU_FIGHT_Y - 1, ws: [MENU_W], hs: [3], charset: 2,
      header_format: '[1;35m',
      header: ` ${[`COMBAT vs ${n}`, `DUEL with ${n}`, `SKIRMISH vs ${n}`, `${n} MURDER`][title_idx]} `
    });

    let pos = [terminal.x, terminal.y];
    statusDisplay();
    terminal.moveto(pos[0], pos[1]);

    glov_engine.setState(playerActionMenu);
  }

  function fightInit(difficulty) {
    title_idx = floor(random() * 4);
    if (character.hp >= 20 && (character.upgrades >= 2 && difficulty === 0 ||
      character.upgrades >= 3 && difficulty === 1)
    ) {
      terminal.clear();

      terminal.print({
        x: 0,
        y: 10,
        fg: 3+8,
        text: '       On second thought, this prey would be too easy, you decide\r\n' +
              '                                to hunt something else instead...',
      });

      pakThen(killingFieldsInit);
      return;
    }


    // tier 0 =
    //   we do 5.625 damage / round
    //   want to lose 10 hp in the battle
    //   want the battle to be about 6 rounds
    // tier 1 =
    //   we do 11.25 damage / round
    // tier 2 =
    //   we do 14.25 damage / round
    //   want to lose 20 hp in a tier 2 battle
    // tier 3 = we take 25% damage
    //   want to lose 10 hp in 8 rounds
    enemy = {
      name: ['Bunny', 'Dire Bunny', 'Caerbannoger'][difficulty],
      hp: [35, 80, 115][difficulty],
      hit_chance: [50, 50, 25][difficulty],
      damage_base: [2, 5, 15][difficulty],
      damage_range: [2, 3, 10][difficulty],
      // flee_chance: [2][difficulty],
      loot: [20, 30, 40][difficulty],
    };
    enemy.maxhp = enemy.hp;

    terminal.print({ x: 0, y: MENU_KILLING_Y + 7,
      text: `A ${enemy.name} draws near!\r\n\r\n` });

    if (rand100() < character.initiative) {
      terminal.print({
        fg: 2+8,
        text: 'You strike first.\r\n\r\n',
      });
      doPlayerAction();
    } else {
      terminal.print({
        fg: 4+8,
        text: 'The enemy strikes first.\r\n\r\n',
      });
      pakThen(doEnemyAttack);
    }
  }

  function summon(idx) {
    if (!idx) {
      terminal.clear();
      terminal.print({ fg: 7, x: 20, y: 10, text: ' A wizzard, somewhere, begins the ritual.' });
      pakThen(summon.bind(null, 1));
    } else if (idx === 1) {
      terminal.print({ fg: 8, x: 20, y: 10, text: ' A wizzard, somewhere, begins the ritual.' });
      terminal.print({ fg: 7, x: 20, y: 12, text: '  You feel yourself wrenched from here' });
      terminal.print({ fg: 7, x: 20, y: 13, text: 'and appear on another plane of existence.' });
      pakThen(summon.bind(null, 2));
    } else if (idx === 2) {
      terminal.print({ fg: 8, x: 20, y: 12, text: '  You feel yourself wrenched from here' });
      terminal.print({ fg: 8, x: 20, y: 13, text: 'and appear on another plane of existence.' });
      terminal.print({ fg: 7, x: 20, y: 15, text: ' One very, very full of [1;32mdelicious[0m food.' });
      pakThen(summon.bind(null, 3));
    } else if (idx === 3) {
      terminal.print({ fg: 8, x: 20, y: 15, text: ' One very, very full of delicious food.' });
      terminal.print({ fg: 7, x: 20, y: 17, text: '         Thanks for playing!' });
    }
  }


  function summonDemonInit() {
    terminal.moveto(AFTER_MENU_X, AFTER_MENU_Y);
    if (!character.upgrades) {
      terminal.print({ text: 'Not yet, you must be much stronger.' });
    } else if (character.upgrades === 1) {
      terminal.print({ text: 'Not yet, you must be stronger.' });
    } else if (character.upgrades === 2) {
      terminal.print({ text: 'Getting closer, but not quite there yet.' });
    } else if (character.upgrades === 3) {
      terminal.print({ text: 'So close, just a little stronger.' });
    } else if (character.upgrades === 4 && character.hp !== character.maxhp) {
      terminal.print({ text: 'You feel you are strong enough, but need to be full of life.' });
    } else {
      summon(0);
      return;
    }
    pakThen(killingFieldsInit);
  }

  let last_killing = 0;
  function killingFields() {
    let sel = terminal.menu({
      x: MENU_KILLING_X,
      y: MENU_KILLING_Y,
      def_idx: last_killing,
      items: [
        'Hunt something cute and harmless ',
        'Hunt something with teeth ',
        'Hunt something dangerous ',
        'Summon the [31mRed Demon ',
        'Back to [1;34mTown ',
      ],
    });

    switch (sel) { // eslint-disable-line default-case
      case 0:
      case 1:
      case 2:
        last_killing = sel;
        fightInit(sel);
        break;
      case 3:
        summonDemonInit();
        break;
      case 4:
        townInit();
        break;
    }
  }

  function killingFieldsInit() {
    terminal.clear();
    statusDisplay();
    terminal.print({ y: 4, text: 'You [31mhunger[0m. There is prey about.' });

    terminal.cells({
      x: MENU_KILLING_X - 2, y: MENU_KILLING_Y - 1, ws: [MENU_KILLING_W], hs: [5], charset: 3,
      header_format: '[1;32m',
      header: ' THE KILLING FIELDS ',
    });

    glov_engine.setState(killingFields);
  }

  function innInit() {
    statusDisplay();
    let y = 13;
    terminal.print({ x: AFTER_MENU_X, y,
      text: 'There\'s nothing to do here but drink your life away... you return to the\r\n' +
        '    [1;34mTown Square[0m after some deep introspection.' });
    y += 3;
    terminal.cells({
      x: 20 - 2, y, ws: [40], hs: [5], charset: 0,
      header: ' CHARACTER STATS ',
    });
    y++;
    terminal.print({
      fg: 7, x: 20, y, text: `LIFE: [1;31m${character.hp}[0m/[1;31m${character.maxhp}`,
    });
    y++;
    terminal.print({
      fg: 7, x: 20, y, text: `Hit chance: [1;34m${character.hit_chance}%`,
    });
    y++;
    terminal.print({
      fg: 7, x: 20, y, text: `Damage: [1;31m${character.damage_base}[0m-` +
      `[1;31m${character.damage_base + character.damage_range}`,
    });
    y++;
    terminal.print({
      fg: 7, x: 20, y, text: `Chance to strike first: [1;34m${character.initiative}%`,
    });
    y++;
    terminal.print({
      fg: 7, x: 20, y, text: `Damage Reduction: [1;34m${character.damage_reduction * 100}%`,
    });
    pakThen(townInit);
  }

  function shop3() {
    let sel = terminal.menu({
      x: MENU_SHOP_X,
      y: MENU_SHOP_Y,
      items: [
        'Accept',
        'Refuse',
      ],
    });

    switch (sel) { // eslint-disable-line default-case
      case 0:
        if (character.hp <= 50) {
          terminal.print({ fg: 6, x: AFTER_MENU_X, y: AFTER_MENU_Y, text: 'You would die. Come back later.' });
          pakThen(townInit);
        } else {
          terminal.print({ fg: 7, x: AFTER_MENU_X, y: AFTER_MENU_Y + 1, text: 'You... make use of... the arms,' +
            ' and feel much stronger.' });
          character.hp -= 50;
          character.upgrades++;
          switch (character.upgrades) { // eslint-disable-line default-case
            case 1:
              character.damage_base = character.damage_range = 10;
              break;
            case 2:
              character.initiative = 95;
              character.hit_chance = 95;
              break;
            case 3:
              character.damage_reduction = 0.75;
              break;
            case 4:
              character.maxhp = 200;
              break;
          }
          pakThen(townInit);
        }
        break;
      case 1:
        terminal.print({ fg: 6, x: AFTER_MENU_X, y: AFTER_MENU_Y, text: 'You\'ll be back...' });
        pakThen(townInit);
        break;
    }

  }

  function shop2() {
    terminal.print({ fg: 6, x: 20, y: 11, text: 'Just give me [1;31m50 LIFE[0;33m, and they\'re yours.' });
    terminal.print({ fg: 8, x: 20, y: 12, text: `                  (You currently have ${character.hp} LIFE)` });
    glov_engine.setState(shop3);
  }

  function shop1() {
    terminal.print({ fg: 8, x: 12, y: 6, text: 'Psst!  Over here...' });
    if (character.upgrades === 0) {
      terminal.print({ fg: 6, x: 20, y: 8, text: 'I\'ve got some really sharp arms here, fresh off a heroic' });
      terminal.print({ fg: 6, x: 20, y: 9, text: 'adventurer... they\'ll double your attack!' });
    } else if (character.upgrades === 1) {
      terminal.print({ fg: 6, x: 20, y: 8, text: 'I\'ve got some really precise arms here, but I can\'t tell you' });
      terminal.print({ fg: 6, x: 20, y: 9, text: 'exactly where I got them... They\'ll boost your accuracy!' });
    } else if (character.upgrades === 2) {
      terminal.print({ fg: 6, x: 20, y: 8, text: 'I\'ve got some really shiny arms here, right from an over-' });
      terminal.print({ fg: 6, x: 20, y: 9, text: 'zealous tank... they\'ll greatly reduce the damage you take!' });
    } else if (character.upgrades === 3) {
      terminal.print({ fg: 6, x: 20, y: 8, text: 'I\'ve got some really thick arms here, from a real tough' });
      terminal.print({ fg: 6, x: 20, y: 9, text: 'guy... they\'ll double your maximum LIFE!' });
    }
    pakThen(shop2);
  }

  function shopInit() {
    terminal.clear();

    terminal.print({ fg: 6, x: 12, y: 6, text: 'Psst!  Over here...' });
    pakThen(shop1);
  }


  function town() {
    let sel = terminal.menu({
      x: MENU_X,
      y: MENU_Y,
      items: [
        'The [1;32mKilling Fields ',
        'Shady Arms Dealer ',
        'The Taupe Dragon Inn ',
      ],
    });

    switch (sel) { // eslint-disable-line default-case
      case 0:
        killingFieldsInit();
        break;
      case 1:
        shopInit();
        break;
      case 2:
        innInit();
        break;
    }
  }

  function townInit() {
    terminal.clear();
    statusDisplay();
    terminal.print({ text: '\r\n\r\n   You enter the [1;34mTown Square[0m.  This place looks pretty dead, but\r\n' +
                           '   you\'re sure to be able to quench your thirst somewhere.' });

    terminal.cells({
      x: MENU_X - 2, y: MENU_Y - 1, ws: [MENU_W], hs: [3], charset: 2,
      header_format: '[1;34m',
      header: ' TOWN SQUARE ',
    });

    glov_engine.setState(town);
  }

  function introInit() {
    terminal.clear();

    terminal.print({ fg: 7, bg: 0, y: 5, text: 'Like most protagonists, you are a bit confused, and' +
      ' do not know exactly why you are here. You just know that, somewhere, a' +
      ' [31mRed Demon[0m will be summoned.' });

    pakThen(townInit);
  }

  glov_engine.addTickFunc(function () {
    glov_camera.set(0, 0, 80, 25);
  });
  glov_engine.addTickFuncLate(function () {
    glov_camera.set(0, 0, glov_engine.game_width, glov_engine.game_height);
    terminal.render();
  });
  introInit();
}
