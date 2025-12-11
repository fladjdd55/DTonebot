"use strict";
// server/Routes.ts
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var cors_1 = __importDefault(require("cors"));
var path_1 = __importDefault(require("path"));
var stripe_1 = __importDefault(require("stripe"));
var node_cron_1 = __importDefault(require("node-cron"));
var dtone_1 = require("./dtone");
var sync_countries_1 = require("./scripts/sync-countries");
var sync_operators_1 = require("./scripts/sync-operators");
var sync_products_1 = require("./scripts/sync-products");
var payment_1 = require("./payment");
var db_1 = require("./db");
var app = (0, express_1.default)();
var PORT = process.env.PORT || 5000;
var stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' });
app.use((0, cors_1.default)());
// ==================================================================
// 1. STRIPE WEBHOOK (Must be BEFORE express.json)
// ==================================================================
// ✅ FIX: Use express.raw() to verify Stripe signatures correctly
app.post('/api/hooks/stripe', express_1.default.raw({ type: 'application/json' }), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var sig, webhookSecret, event, paymentIntent, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sig = req.headers['stripe-signature'];
                webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
                if (!webhookSecret)
                    return [2 /*return*/, res.status(500).send('Webhook secret not configured')];
                if (!sig)
                    return [2 /*return*/, res.status(400).send('Missing signature')];
                try {
                    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
                }
                catch (err) {
                    console.error("Webhook Signature Error: ".concat(err.message));
                    return [2 /*return*/, res.status(400).send("Webhook Error: ".concat(err.message))];
                }
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, , 5]);
                if (!(event.type === 'payment_intent.succeeded')) return [3 /*break*/, 3];
                paymentIntent = event.data.object;
                console.log("[Webhook] Payment Succeeded: ".concat(paymentIntent.id));
                // ✅ Uses unified race-proof logic
                return [4 /*yield*/, processPurchase({
                        paymentId: paymentIntent.id,
                        mobile: paymentIntent.metadata.mobile,
                        productId: Number(paymentIntent.metadata.productId),
                        amount: paymentIntent.amount / 100,
                        currency: paymentIntent.currency.toUpperCase(),
                        type: paymentIntent.metadata.type || 'UNKNOWN'
                    })];
            case 2:
                // ✅ Uses unified race-proof logic
                _a.sent();
                _a.label = 3;
            case 3:
                res.json({ received: true });
                return [3 /*break*/, 5];
            case 4:
                error_1 = _a.sent();
                console.error('Webhook handler failed:', error_1);
                res.status(500).send('Webhook handler failed');
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
// ✅ GLOBAL PARSER: Now we can use JSON for everything else
app.use(express_1.default.json());
// ==================================================================
// 🚀 CACHE & SCHEDULER (Full Logic)
// ==================================================================
var COUNTRY_CACHE = [];
var OPERATOR_CACHE = [];
// 1. Initial Load (On Server Start)
var initializeCache = function () { return __awaiter(void 0, void 0, void 0, function () {
    var c, o, e_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log('[Server] ⏳ Initializing Caches...');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, , 5]);
                return [4 /*yield*/, (0, sync_countries_1.syncCountries)()];
            case 2:
                c = _a.sent();
                if (c)
                    COUNTRY_CACHE = c;
                return [4 /*yield*/, (0, sync_operators_1.syncOperators)()];
            case 3:
                o = _a.sent();
                if (o)
                    OPERATOR_CACHE = o;
                // ✅ CONTROLLED SYNC: Only run if .env says so
                if (process.env.SYNC_ON_STARTUP === 'true') {
                    console.log('[Server] 📦 SYNC_ON_STARTUP=true. Starting product sync...');
                    (0, sync_products_1.syncProducts)(); // Run in background (don't await)
                }
                else {
                    console.log('[Server] ⏭️  SYNC_ON_STARTUP=false. Skipping product sync.');
                }
                console.log("[Server] \uD83D\uDE80 System Ready!");
                return [3 /*break*/, 5];
            case 4:
                e_1 = _a.sent();
                console.error("Cache init failed", e_1);
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); };
// Run immediately on start
initializeCache();
// 2. Cron Schedule (Runs daily at 03:00 AM)
node_cron_1.default.schedule('0 3 * * *', function () { return __awaiter(void 0, void 0, void 0, function () {
    var c, o, err_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log('[Scheduler] 🌙 3 AM Sync Starting...');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 5, , 6]);
                return [4 /*yield*/, (0, sync_countries_1.syncCountries)()];
            case 2:
                c = _a.sent();
                if (c)
                    COUNTRY_CACHE = c;
                return [4 /*yield*/, (0, sync_operators_1.syncOperators)()];
            case 3:
                o = _a.sent();
                if (o)
                    OPERATOR_CACHE = o;
                return [4 /*yield*/, (0, sync_products_1.syncProducts)()];
            case 4:
                _a.sent();
                console.log('[Scheduler] ✅ Daily sync complete.');
                return [3 /*break*/, 6];
            case 5:
                err_1 = _a.sent();
                console.error('[Scheduler] ❌ Daily sync failed:', err_1);
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); });
// ==================================================================
// 🧩 UNIFIED PURCHASE LOGIC (Race-Condition Proof)
// ==================================================================
function processPurchase(data) {
    return __awaiter(this, void 0, void 0, function () {
        var paymentId, mobile, productId, amount, currency, type, err_2, existing, callbackUrl, result, statusId, dbStatus;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    paymentId = data.paymentId, mobile = data.mobile, productId = data.productId, amount = data.amount, currency = data.currency, type = data.type;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 5]);
                    return [4 /*yield*/, db_1.db.transaction.create({
                            data: {
                                externalId: "pending_".concat(paymentId), // Temporary ID
                                paymentIntentId: paymentId,
                                paymentId: paymentId,
                                mobile: mobile,
                                productId: productId,
                                amount: amount,
                                currency: currency,
                                productType: type,
                                status: 'PENDING' // ⏳ Lock status
                            }
                        })];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 3:
                    err_2 = _a.sent();
                    // 🛑 If UNIQUE constraint fails, it means another process (Webhook or API) won the race
                    console.log("[Purchase] Lock failed for ".concat(paymentId, " (Duplicate Request). Skipping."));
                    return [4 /*yield*/, db_1.db.transaction.findUnique({ where: { paymentIntentId: paymentId } })];
                case 4:
                    existing = _a.sent();
                    return [2 /*return*/, __assign(__assign({ success: (existing === null || existing === void 0 ? void 0 : existing.status) === 'COMPLETED' }, existing), { dbStatus: existing === null || existing === void 0 ? void 0 : existing.status })];
                case 5:
                    // 2. 🚀 EXECUTE: We won the lock, so WE call DTOne
                    console.log("[Purchase] Lock Acquired. Processing order for ".concat(paymentId, "..."));
                    callbackUrl = process.env.DTONE_CALLBACK_URL ? "".concat(process.env.DTONE_CALLBACK_URL, "/api/hooks/dtone") : undefined;
                    return [4 /*yield*/, dtone_1.dtoneService.purchaseProduct(productId, mobile, amount, currency, type, callbackUrl)];
                case 6:
                    result = _a.sent();
                    if (!(!result.success || !result.data)) return [3 /*break*/, 9];
                    console.error("[Purchase] \u274C API Error: ".concat(result.error));
                    return [4 /*yield*/, payment_1.paymentService.refundPayment(paymentId)];
                case 7:
                    _a.sent();
                    return [4 /*yield*/, db_1.db.transaction.update({
                            where: { paymentIntentId: paymentId },
                            data: { status: 'REFUNDED', externalId: "failed_".concat(paymentId) }
                        })];
                case 8:
                    _a.sent();
                    return [2 /*return*/, { success: false, error: result.error, code: result.code, refunded: true }];
                case 9:
                    statusId = result.data.statusId;
                    dbStatus = 'PENDING';
                    if (!(statusId === 7)) return [3 /*break*/, 10];
                    // ✅ CASE 1: SUCCESS
                    dbStatus = 'COMPLETED';
                    console.log("[Purchase] \u2705 Success! Top-up sent. DTOne Ref: ".concat(result.data.externalId));
                    return [3 /*break*/, 13];
                case 10:
                    if (![3, 9].includes(statusId || 0)) return [3 /*break*/, 12];
                    // ❌ CASE 2: HARD FAILURE (Rejected/Declined)
                    console.warn("[Purchase] \u26A0\uFE0F Transaction Declined (Status ".concat(statusId, "). Refund initiated..."));
                    return [4 /*yield*/, payment_1.paymentService.refundPayment(paymentId)];
                case 11:
                    _a.sent();
                    dbStatus = 'FAILED';
                    return [3 /*break*/, 13];
                case 12:
                    // ⏳ CASE 3: PENDING/OTHER
                    console.log("[Purchase] \u23F3 Transaction Submitted (Status ".concat(statusId, "). Waiting for callback."));
                    _a.label = 13;
                case 13: 
                // Update Database with Final Status
                return [4 /*yield*/, db_1.db.transaction.update({
                        where: { paymentIntentId: paymentId },
                        data: {
                            status: dbStatus,
                            externalId: result.data.externalId
                        }
                    })];
                case 14:
                    // Update Database with Final Status
                    _a.sent();
                    return [2 /*return*/, __assign(__assign({ success: dbStatus === 'COMPLETED' || dbStatus === 'PENDING' }, result.data), { dbStatus: dbStatus, refunded: dbStatus === 'FAILED' })];
            }
        });
    });
}
// ==================================================================
// API ROUTES
// ==================================================================
app.get('/api/countries', function (_req, res) { return res.json(COUNTRY_CACHE); });
app.get('/api/operators', function (req, res) {
    var country = req.query.country;
    if (country) {
        return res.json(OPERATOR_CACHE.filter(function (op) { return op.countryCode === String(country).toUpperCase(); }));
    }
    return res.json(OPERATOR_CACHE);
});
app.get('/api/products', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, operatorId, currency_1, ranged, opId, whereClause, localProducts, mapped, result, apiProducts, error_2;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 3, , 4]);
                _a = req.query, operatorId = _a.operatorId, currency_1 = _a.currency, ranged = _a.ranged;
                if (!operatorId)
                    return [2 /*return*/, res.status(400).json({ error: 'Operator ID is required' })];
                opId = Number(operatorId);
                whereClause = { operatorId: opId };
                if (currency_1)
                    whereClause.currency = String(currency_1).toUpperCase();
                if (ranged === 'true')
                    whereClause.type = { contains: 'RANGED' };
                return [4 /*yield*/, db_1.db.product.findMany({
                        where: whereClause,
                        orderBy: { amount: 'asc' }
                    })];
            case 1:
                localProducts = _b.sent();
                if (localProducts.length > 0) {
                    mapped = localProducts.map(function (p) { return ({
                        id: p.id,
                        name: p.name,
                        type: p.type,
                        amount: p.amount ? "".concat(p.amount.toFixed(2), " ").concat(p.currency) : 'N/A',
                        currency: p.currency,
                        min: p.minAmount || 0,
                        max: p.maxAmount || 0,
                        subserviceId: p.serviceId,
                        benefits: []
                    }); });
                    return [2 /*return*/, res.json(mapped)];
                }
                // 3. Fallback: Live API
                console.log("[Cache Miss] Fetching live products for Op ".concat(opId));
                return [4 /*yield*/, dtone_1.dtoneService.getProductsForOperator(opId, 1, 100, 'en')];
            case 2:
                result = _b.sent();
                if (!result.success || !result.data) {
                    return [2 /*return*/, res.status(400).json({ error: result.error, code: result.code })];
                }
                apiProducts = result.data;
                if (currency_1)
                    apiProducts = apiProducts.filter(function (p) { return p.currency === String(currency_1).toUpperCase(); });
                if (ranged === 'true')
                    apiProducts = apiProducts.filter(function (p) { return p.type.includes('RANGED'); });
                return [2 /*return*/, res.json(apiProducts)];
            case 3:
                error_2 = _b.sent();
                console.error('Error fetching products:', error_2);
                return [2 /*return*/, res.status(500).json({ error: error_2.message })];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.post('/api/create-payment-intent', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, amount, currency, mobile, productId, type, result, error_3;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, amount = _a.amount, currency = _a.currency, mobile = _a.mobile, productId = _a.productId, type = _a.type;
                if (!amount || !currency)
                    return [2 /*return*/, res.status(400).json({ error: 'Amount and currency are required' })];
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, payment_1.paymentService.createPaymentIntent(amount, currency, {
                        mobile: mobile,
                        productId: productId,
                        type: type
                    })];
            case 2:
                result = _b.sent();
                res.json(result);
                return [3 /*break*/, 4];
            case 3:
                error_3 = _b.sent();
                res.status(500).json({ error: error_3.message });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.post('/api/lookup', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var mobile, result, error_4;
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
                if (!result.success)
                    return [2 /*return*/, res.status(404).json({ error: result.error, code: result.code })];
                return [2 /*return*/, res.json(result.data)];
            case 3:
                error_4 = _a.sent();
                return [2 /*return*/, res.status(500).json({ error: error_4.message })];
            case 4: return [2 /*return*/];
        }
    });
}); });
// ✅ UPDATED PURCHASE ROUTE
app.post('/api/purchase', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, productId, mobile, amount, unit, paymentId, type, result, error_5;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, productId = _a.productId, mobile = _a.mobile, amount = _a.amount, unit = _a.unit, paymentId = _a.paymentId, type = _a.type;
                if (!productId || !mobile || !paymentId)
                    return [2 /*return*/, res.status(400).json({ error: 'Missing required fields' })];
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, processPurchase({
                        paymentId: paymentId,
                        mobile: mobile,
                        productId: Number(productId),
                        amount: Number(amount || 0),
                        currency: unit || 'UNKNOWN',
                        type: type || 'UNKNOWN'
                    })];
            case 2:
                result = _b.sent();
                return [2 /*return*/, res.json(result)];
            case 3:
                error_5 = _b.sent();
                console.error("Purchase API Error:", error_5);
                return [2 /*return*/, res.status(500).json({ success: false, error: 'Internal server error' })];
            case 4: return [2 /*return*/];
        }
    });
}); });
// Callback Route
app.post('/api/hooks/dtone', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        console.log('[DTOne Callback]', req.body);
        res.status(200).send('OK');
        return [2 /*return*/];
    });
}); });
var DIST_PATH = path_1.default.join(process.cwd(), 'dist');
app.use(express_1.default.static(DIST_PATH));
app.get(/(.*)/, function (_req, res) { return res.sendFile(path_1.default.join(DIST_PATH, 'index.html')); });
app.listen(Number(PORT), '0.0.0.0', function () { return console.log("\uD83D\uDE80 API Server running on port ".concat(PORT)); });
