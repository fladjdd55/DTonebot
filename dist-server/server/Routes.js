"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var cors_1 = __importDefault(require("cors"));
var path_1 = __importDefault(require("path"));
var dtone_1 = require("./dtone");
var sync_countries_1 = require("./scripts/sync-countries");
var sync_operators_1 = require("./scripts/sync-operators");
var payment_1 = require("./payment");
var app = (0, express_1.default)();
var PORT = process.env.PORT || 5000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// ==================================================================
// 🚀 CACHE SYSTEM
// ==================================================================
var COUNTRY_CACHE = [];
var OPERATOR_CACHE = [];
var initializeCache = function () { return __awaiter(void 0, void 0, void 0, function () {
    var countries, operators, e_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log('[Server] ⏳ Initializing Caches...');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, , 5]);
                return [4 /*yield*/, (0, sync_countries_1.syncCountries)()];
            case 2:
                countries = _a.sent();
                if (countries)
                    COUNTRY_CACHE = countries;
                return [4 /*yield*/, (0, sync_operators_1.syncOperators)()];
            case 3:
                operators = _a.sent();
                if (operators)
                    OPERATOR_CACHE = operators;
                console.log("[Server] \uD83D\uDE80 System Ready! Countries: ".concat(COUNTRY_CACHE.length, ", Operators: ").concat(OPERATOR_CACHE.length));
                return [3 /*break*/, 5];
            case 4:
                e_1 = _a.sent();
                console.error("Cache init failed", e_1);
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); };
initializeCache();
setInterval(function () {
    console.log('[Server] ⏰ Running Daily Maintenance...');
    (0, sync_countries_1.syncCountries)().then(function (d) { if (d)
        COUNTRY_CACHE = d; });
    (0, sync_operators_1.syncOperators)().then(function (d) { if (d)
        OPERATOR_CACHE = d; });
}, 1000 * 60 * 60 * 24);
// ==================================================================
// API ROUTES
// ==================================================================
app.get('/api/countries', function (_req, res) {
    return res.json(COUNTRY_CACHE);
});
app.get('/api/operators', function (req, res) {
    var country = req.query.country;
    if (country) {
        var filtered = OPERATOR_CACHE.filter(function (op) { return op.countryCode === String(country).toUpperCase(); });
        return res.json(filtered);
    }
    return res.json(OPERATOR_CACHE);
});
app.post('/api/create-payment-intent', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, amount, currency, result, error_1;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, amount = _a.amount, currency = _a.currency;
                if (!amount || !currency)
                    return [2 /*return*/, res.status(400).json({ error: 'Amount and currency are required' })];
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, payment_1.paymentService.createPaymentIntent(amount, currency)];
            case 2:
                result = _b.sent();
                res.json(result);
                return [3 /*break*/, 4];
            case 3:
                error_1 = _b.sent();
                res.status(500).json({ error: error_1.message });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.post('/api/lookup', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var mobile, result, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mobile = req.body.mobile;
                if (!mobile)
                    return [2 /*return*/, res.status(400).json({ error: 'Mobile number is required' })];
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, dtone_1.dtoneService.lookupMobileNumber(mobile)];
            case 2:
                result = _a.sent();
                if (!result.success) {
                    return [2 /*return*/, res.status(404).json({ error: result.error, code: result.code })];
                }
                return [2 /*return*/, res.json(result.data)];
            case 3:
                error_2 = _a.sent();
                return [2 /*return*/, res.status(500).json({ error: error_2.message })];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.post('/api/products', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var operatorId, result, error_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                operatorId = req.body.operatorId;
                if (!operatorId)
                    return [2 /*return*/, res.status(400).json({ error: 'Operator ID is required' })];
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, dtone_1.dtoneService.getProductsForOperator(operatorId)];
            case 2:
                result = _a.sent();
                if (!result.success) {
                    return [2 /*return*/, res.status(400).json({ error: result.error, code: result.code })];
                }
                return [2 /*return*/, res.json(result.data)];
            case 3:
                error_3 = _a.sent();
                return [2 /*return*/, res.status(500).json({ error: error_3.message })];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.post('/api/purchase', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, productId, mobile, amount, unit, result, error_4;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, productId = _a.productId, mobile = _a.mobile, amount = _a.amount, unit = _a.unit;
                if (!productId || !mobile)
                    return [2 /*return*/, res.status(400).json({ error: 'Missing fields' })];
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, dtone_1.dtoneService.purchaseProduct(productId, mobile, amount || 0, unit)];
            case 2:
                result = _b.sent();
                if (!result.success) {
                    return [2 /*return*/, res.status(400).json({ error: result.error, code: result.code })];
                }
                return [2 /*return*/, res.json(result.data)];
            case 3:
                error_4 = _b.sent();
                return [2 /*return*/, res.status(500).json({ error: error_4.message })];
            case 4: return [2 /*return*/];
        }
    });
}); });
// ==================================================================
// 📂 SERVE REACT FRONTEND (MUST BE LAST)
// ==================================================================
app.use(express_1.default.static(path_1.default.join(__dirname, '../dist')));
// FIX: Use Regex (/(.*)/) instead of '*' for Express 5 compatibility
app.get(/(.*)/, function (_req, res) {
    res.sendFile(path_1.default.join(__dirname, '../dist/index.html'));
});
app.listen(PORT, function () {
    console.log("\uD83D\uDE80 API Server running on port ".concat(PORT));
});
