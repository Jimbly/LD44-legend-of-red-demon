// Copyright (c) 2012-2014 Turbulenz Limited


var debug = {
    // Override this to change the behaviour when asserts are
    // triggered.  Default logs the message to the console and then
    // throws an exception.
    reportAssert: function debugReportAssertFn(msg) {
        var fnName;
        var stackTrace;

        if ('undefined' !== typeof Error && (Error.captureStackTrace)) {
            var getStackTrace = function debugReportAssertGetStackTraceFn() {
                var obj = {};
                Error.captureStackTrace(obj, getStackTrace);
                stackTrace = obj.stack;

                // Attempt to get the name of the function in which
                // debug.assert was called.
                var fnFrame = stackTrace.split("\n")[3];
                fnName = fnFrame.substr(fnFrame.indexOf("at ") + 3);
            };
            getStackTrace();
        }

        if (fnName) {
            msg = "ASSERT at " + fnName + ": " + msg;
        } else {
            msg = "ASSERT: " + msg;
        }

        // plugin does not have a "console" object
        // web workers do not have a "window" object
        var consoleObj;

        if (typeof console !== 'undefined') {
            consoleObj = console;
        }
        if (typeof window !== 'undefined') {
            consoleObj = window.console;
        }

        if (consoleObj) {
            consoleObj.log(msg);

            if (stackTrace) {
                consoleObj.log(stackTrace);
            }
        }

        throw msg;
    },
    abort: function debugAbortFn(msg) {
        debug.reportAssert(msg);
    },
    // Basic assertion that a condition is true.
    assert: function debugAssertFn(condition, msg) {
        if (!condition) {
            if (!msg) {
                msg = "Unlabelled assert";
            }

            // TODO : Grab information about the caller?
            debug.reportAssert(msg);
        }
    },
    log: function debugAssertLogFn(msg) {
        window.console.log(msg);
    },
    evaluate: function debugEvaluateFn(fn) {
        fn();
    },
    isNumber: function debugIsNumber(s) {
        return "number" === typeof s;
    },
    isMathType: function isMathTypeFn(v) {
        if (v instanceof Float32Array) {
            return true;
        }

        // For now, math type errors do not generate a full assert
        // (hence we return true).  They just trigger the callback.
        if (TurbulenzEngine.onperformancewarning) {
            TurbulenzEngine.onperformancewarning("Object is not of type Float32Array.  If this message appears " + "frequently, performance of your game may be affected.");
        }

        return true;
    },
    isVec2: function debugIsVec2Fn(v) {
        return (2 <= v.length); // JE: More flexible
    },
    isVec3: function debugIsVec3Fn(v) {
        return (3 <= v.length); // JE: More flexible
    },
    isVec4: function debugIsVec4Fn(v) {
        return (4 <= v.length); // JE: More flexible
    },
    isAABB: function debugIsAABBFn(v) {
        return (6 === v.length);
    },
    isQuat: function debugIsQuatFn(v) {
        return (4 === v.length);
    },
    isMtx33: function debugIsMtx33Fn(v) {
        return (9 === v.length);
    },
    isMtx43: function debugIsMtx43Fn(v) {
        return (12 === v.length);
    },
    isMtx34: function debugIsMtx34Fn(v) {
        return (12 === v.length);
    },
    isMtx44: function debugIsMtx44Fn(v) {
        return (16 === v.length);
    },
    isQuatPos: function debugIsQuatPos(v) {
        return (7 === v.length);
    }
};
