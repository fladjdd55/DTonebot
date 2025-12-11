"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = WebhookTester;
var react_1 = require("react");
var lucide_react_1 = require("lucide-react");
function WebhookTester() {
    var _this = this;
    var _a = (0, react_1.useState)('https://dev.taptopload.com/api/hooks/stripe'), webhookUrl = _a[0], setWebhookUrl = _a[1];
    var _b = (0, react_1.useState)(null), results = _b[0], setResults = _b[1];
    var _c = (0, react_1.useState)(false), testing = _c[0], setTesting = _c[1];
    var _d = (0, react_1.useState)([]), logs = _d[0], setLogs = _d[1];
    var addLog = function (message, type) {
        if (type === void 0) { type = 'info'; }
        setLogs(function (prev) { return __spreadArray(__spreadArray([], prev, true), [{
                time: new Date().toLocaleTimeString(),
                message: message,
                type: type
            }], false); });
    };
    var copyToClipboard = function (text) {
        navigator.clipboard.writeText(text);
        addLog('Copied to clipboard!', 'success');
    };
    var testWebhook = function () { return __awaiter(_this, void 0, void 0, function () {
        var tests, getResponse, e_1, postResponse, text, e_2, allPassed, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setTesting(true);
                    setResults(null);
                    setLogs([]);
                    addLog('Starting webhook tests...', 'info');
                    tests = {
                        accessibility: { status: 'pending', message: 'Testing endpoint accessibility...' },
                        format: { status: 'pending', message: 'Testing POST request format...' },
                        signature: { status: 'pending', message: 'Testing signature requirement...' }
                    };
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 11, 12, 13]);
                    // Test 1: Basic GET (should fail, but shows server is up)
                    addLog('Test 1: Checking if endpoint responds...', 'info');
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, fetch(webhookUrl, { method: 'GET' })];
                case 3:
                    getResponse = _a.sent();
                    if (getResponse.status === 405) {
                        tests.accessibility = {
                            status: 'success',
                            message: '✅ Endpoint is accessible (correctly rejects GET requests)'
                        };
                        addLog('Endpoint is live!', 'success');
                    }
                    else {
                        tests.accessibility = {
                            status: 'warning',
                            message: "\u26A0\uFE0F Unexpected response: ".concat(getResponse.status)
                        };
                        addLog("Warning: Got ".concat(getResponse.status, " instead of 405"), 'warning');
                    }
                    return [3 /*break*/, 5];
                case 4:
                    e_1 = _a.sent();
                    tests.accessibility = {
                        status: 'error',
                        message: '❌ Cannot reach endpoint - check if server is running'
                    };
                    addLog('ERROR: Cannot connect to server', 'error');
                    return [3 /*break*/, 5];
                case 5:
                    // Test 2: POST without signature (expected to fail)
                    addLog('Test 2: Testing POST without signature...', 'info');
                    _a.label = 6;
                case 6:
                    _a.trys.push([6, 9, , 10]);
                    return [4 /*yield*/, fetch(webhookUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ test: true })
                        })];
                case 7:
                    postResponse = _a.sent();
                    return [4 /*yield*/, postResponse.text()];
                case 8:
                    text = _a.sent();
                    if (text.includes('Missing signature') || postResponse.status === 400) {
                        tests.signature = {
                            status: 'success',
                            message: '✅ Webhook correctly requires Stripe signature'
                        };
                        tests.format = {
                            status: 'success',
                            message: '✅ Server accepts POST requests with JSON body'
                        };
                        addLog('Security working: Signature is required ✓', 'success');
                    }
                    else {
                        tests.signature = {
                            status: 'error',
                            message: "\u274C Unexpected response: ".concat(text)
                        };
                        addLog("ERROR: Unexpected response - ".concat(text), 'error');
                    }
                    return [3 /*break*/, 10];
                case 9:
                    e_2 = _a.sent();
                    tests.format = {
                        status: 'error',
                        message: "\u274C POST request failed: ".concat(e_2.message)
                    };
                    addLog("ERROR: POST failed - ".concat(e_2.message), 'error');
                    return [3 /*break*/, 10];
                case 10:
                    setResults(tests);
                    allPassed = Object.values(tests).every(function (t) { return t.status === 'success'; });
                    if (allPassed) {
                        addLog('🎉 All tests passed! Your webhook is ready for Stripe.', 'success');
                    }
                    else {
                        addLog('⚠️ Some issues detected. Check results above.', 'warning');
                    }
                    return [3 /*break*/, 13];
                case 11:
                    error_1 = _a.sent();
                    addLog("Unexpected error: ".concat(error_1.message), 'error');
                    return [3 /*break*/, 13];
                case 12:
                    setTesting(false);
                    return [7 /*endfinally*/];
                case 13: return [2 /*return*/];
            }
        });
    }); };
    var StatusBadge = function (_a) {
        var status = _a.status;
        switch (status) {
            case 'success':
                return className;
                "w-5 h-5 text-green-500" /  > ;
            case 'error':
                return className;
                "w-5 h-5 text-red-500" /  > ;
            case 'warning':
                return className;
                "w-5 h-5 text-yellow-500" /  > ;
            default:
                return className;
                "w-5 h-5 text-gray-400 animate-spin" /  > ;
        }
    };
    return className = "min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-8" >
        className;
    "max-w-4xl mx-auto" >
        { /* Header */}
        < div;
    className = "bg-white rounded-2xl shadow-xl p-8 mb-6" >
        className;
    "text-3xl font-bold text-gray-900 mb-2" >
    ;
    Stripe;
    Webhook;
    Tester
        < /h1>
        < p;
    className = "text-gray-600" >
        Verify;
    your;
    webhook;
    endpoint;
    is;
    configured;
    correctly
        < /p>
        < /div>;
    { /* Configuration */ }
    className;
    "bg-white rounded-2xl shadow-xl p-8 mb-6" >
        className;
    "text-xl font-bold text-gray-900 mb-4" > Webhook;
    URL < /h2>
        < div;
    className = "flex gap-2" >
        type;
    "text";
    value = { webhookUrl: webhookUrl };
    onChange = {}(e);
    setWebhookUrl(e.target.value);
}
className = "flex-1 px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:outline-none font-mono text-sm";
placeholder = "https://yourdomain.com/api/hooks/stripe"
    /  >
    onClick;
{
    testWebhook;
}
disabled = { testing: testing };
className = "px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
    >
        {} >
    className;
"w-4 h-4 animate-spin" /  >
    Testing;
/>;
('Run Tests');
/button>
    < /div>
    < /div>;
{ /* Test Results */ }
{
    results && className;
    "bg-white rounded-2xl shadow-xl p-8 mb-6" >
        className;
    "text-xl font-bold text-gray-900 mb-4" > Test;
    Results < /h2>
        < div;
    className = "space-y-3" >
        { Object: Object, : .entries(results).map(function (_a) {
                var key = _a[0], test = _a[1];
                return key = { key: key };
            }, className = {}(templateObject_1 || (templateObject_1 = __makeTemplateObject(["p-4 rounded-lg border-2 ", ""], ["p-4 rounded-lg border-2 ", ""])), test.status === 'success' ? 'bg-green-50 border-green-200' :
                test.status === 'error' ? 'bg-red-50 border-red-200' :
                    test.status === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                        'bg-gray-50 border-gray-200')) }
        >
            className;
    "flex items-center gap-3" >
        status;
    {
        test.status;
    }
    />
        < div;
    className = "flex-1" >
        className;
    "font-semibold text-gray-900 capitalize" > { key: key } < /div>
        < div;
    className = "text-sm text-gray-600" > { test: test, : .message } < /div>
        < /div>
        < /div>
        < /div>;
}
/div>
    < /div>;
{ /* Setup Instructions */ }
className;
"bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-xl p-8 text-white mb-6" >
    className;
"text-2xl font-bold mb-4" > ;
Next;
Steps < /h2>
    < div;
className = "space-y-4" >
    className;
"bg-white/10 backdrop-blur-sm rounded-lg p-4" >
    className;
"font-bold mb-2" > 1.;
Add;
Webhook in Stripe;
Dashboard < /h3>
    < a;
href = "https://dashboard.stripe.com/webhooks";
target = "_blank";
rel = "noopener noreferrer";
className = "flex items-center gap-2 text-white/90 hover:text-white underline"
    >
        Open;
Stripe;
Dashboard
    < lucide_react_1.ExternalLink;
className = "w-4 h-4" /  >
    /a>
    < /div>
    < div;
className = "bg-white/10 backdrop-blur-sm rounded-lg p-4" >
    className;
"font-bold mb-2" > 2.;
Configure;
Your;
Endpoint < /h3>
    < div;
className = "space-y-2" >
    className;
"flex items-center gap-2" >
    className;
"text-white/70 text-sm" > Webhook;
URL: /span>
    < code;
className = "bg-black/30 px-3 py-1 rounded text-sm flex-1" >
    { webhookUrl: webhookUrl }
    < /code>
    < button;
onClick = {}();
copyToClipboard(webhookUrl);
className = "p-1 hover:bg-white/10 rounded"
    >
        className;
"w-4 h-4" /  >
    /button>
    < /div>
    < div;
className = "text-sm text-white/70" >
    Select;
event: className;
"bg-black/30 px-2 py-0.5 rounded" > payment_intent.succeeded < /code>
    < /div>
    < /div>
    < /div>
    < div;
className = "bg-white/10 backdrop-blur-sm rounded-lg p-4" >
    className;
"font-bold mb-2" > 3.;
Get;
Webhook;
Signing;
Secret < /h3>
    < p;
className = "text-sm text-white/80 mb-2" >
    After;
creating;
the;
webhook, copy;
the;
signing;
secret(starts);
with (whsec_)
    ;
/p>
    < div;
className = "bg-black/30 rounded p-3 font-mono text-xs" >
    SSH;
into;
your;
VPS: /div>
    < div;
className = "text-green-400 mt-2" > $;
nano / ;
var ;
/www/yourapp / .env < /div>
    < div;
className = "text-white/70 mt-2" > Add;
this;
line: /div>
    < div;
className = "text-yellow-300 mt-1" > STRIPE_WEBHOOK_SECRET;
whsec_your_secret_here < /div>
    < div;
className = "text-white/70 mt-2" > Save;
and;
restart: /div>
    < div;
className = "text-green-400 mt-1" > $;
pm2;
restart;
all < /div>
    < /div>
    < /div>
    < div;
className = "bg-white/10 backdrop-blur-sm rounded-lg p-4" >
    className;
"font-bold mb-2" > 4.;
Test;
from;
Stripe;
Dashboard < /h3>
    < ul;
className = "text-sm text-white/80 space-y-1 list-disc list-inside" >
    Go;
to;
your;
webhook in Stripe;
Dashboard < /li>
    < li > Click;
"Send test webhook" < /li>
    < li > Select;
"payment_intent.succeeded" < /li>
    < li > Check;
if (it)
    shows;
"Succeeded";
status < /li>
    < /ul>
    < /div>
    < /div>
    < /div>;
{ /* Live Logs */ }
className;
"bg-white rounded-2xl shadow-xl p-8" >
    className;
"text-xl font-bold text-gray-900 mb-4" > Activity;
Log < /h2>
    < div;
className = "bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm" >
    __assign({ logs: logs, : .length === 0 ? className = "text-gray-500 text-center py-8" >
            Click : , "Run Tests": to, start: start, testing: testing }, /div>)(logs.map(function (log, i) { return key = { i: i }; }, className = {}(templateObject_2 || (templateObject_2 = __makeTemplateObject(["mb-2 ", ""], ["mb-2 ", ""])), log.type === 'error' ? 'text-red-400' :
        log.type === 'success' ? 'text-green-400' :
            log.type === 'warning' ? 'text-yellow-400' :
                'text-gray-300'), 
        >
            className, "text-gray-500" > [{ log: log, : .time }] < /span> {log.message}
        < /div>));
/div>
    < /div>;
{ /* Server Logs Check */ }
className;
"mt-6 bg-amber-50 border-2 border-amber-200 rounded-2xl p-6" >
    className;
"font-bold text-amber-900 mb-2 flex items-center gap-2" >
    className;
"w-5 h-5" /  >
    Check;
Your;
Server;
Logs
    < /h3>
    < p;
className = "text-amber-800 text-sm mb-3" >
    If;
tests;
pass;
but;
webhooks;
still;
fail, check;
your;
server;
logs;
for (detailed; errors; )
    : /p>
        < code;
className = "block bg-amber-100 p-3 rounded text-sm font-mono text-amber-900" >
    pm2;
logs;
recharge - api--;
lines;
50
    < /code>
    < /div>
    < /div>
    < /div>;
;
var templateObject_1, templateObject_2;
