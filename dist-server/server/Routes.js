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
app.use(express_1.default.json());
// ==================================================================
// 💳 STRIPE WEBHOOK
// ==================================================================
app.post('/api/stripe-webhook', express_1.default.raw({ type: 'application/json' }), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
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
                    return [2 /*return*/, res.status(400).send("Webhook Error: ".concat(err.message))];
                }
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, , 5]);
                if (!(event.type === 'payment_intent.succeeded')) return [3 /*break*/, 3];
                paymentIntent = event.data.object;
                return [4 /*yield*/, handleFailSafePurchase(paymentIntent)];
            case 2:
                _a.sent();
                _a.label = 3;
            case 3:
                res.json({ received: true });
                return [3 /*break*/, 5];
            case 4:
                error_1 = _a.sent();
                res.status(500).send('Webhook handler failed');
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
// ==================================================================
// 🧠 FAIL-SAFE LOGIC
// ==================================================================
var handleFailSafePurchase = function (paymentIntent) { return __awaiter(void 0, void 0, void 0, function () {
    var stripeId, metadata, existingTx, result, status;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                stripeId = paymentIntent.id;
                metadata = paymentIntent.metadata;
                return [4 /*yield*/, db_1.db.transaction.findFirst({ where: { paymentIntentId: stripeId } })];
            case 1:
                existingTx = _c.sent();
                if (existingTx && (existingTx.status === 'COMPLETED' || existingTx.status === 'PENDING'))
                    return [2 /*return*/];
                if (!(metadata === null || metadata === void 0 ? void 0 : metadata.mobile) || !(metadata === null || metadata === void 0 ? void 0 : metadata.productId))
                    return [2 /*return*/];
                return [4 /*yield*/, dtone_1.dtoneService.purchaseProduct(Number(metadata.productId), metadata.mobile, paymentIntent.amount / 100, paymentIntent.currency.toUpperCase(), metadata.type)];
            case 2:
                result = _c.sent();
                status = result.success ? 'COMPLETED' : 'FAILED';
                if (!existingTx) return [3 /*break*/, 4];
                return [4 /*yield*/, db_1.db.transaction.update({
                        where: { id: existingTx.id },
                        data: { status: status, externalId: ((_a = result.data) === null || _a === void 0 ? void 0 : _a.externalId) || existingTx.externalId }
                    })];
            case 3:
                _c.sent();
                return [3 /*break*/, 6];
            case 4: return [4 /*yield*/, db_1.db.transaction.create({
                    data: {
                        externalId: ((_b = result.data) === null || _b === void 0 ? void 0 : _b.externalId) || "retry_".concat(Date.now()),
                        paymentIntentId: stripeId,
                        mobile: metadata.mobile,
                        productId: Number(metadata.productId),
                        amount: paymentIntent.amount / 100,
                        currency: paymentIntent.currency.toUpperCase(),
                        productType: metadata.type || 'UNKNOWN',
                        status: status,
                        paymentId: stripeId
                    }
                })];
            case 5:
                _c.sent();
                _c.label = 6;
            case 6:
                if (!!result.success) return [3 /*break*/, 9];
                return [4 /*yield*/, payment_1.paymentService.refundPayment(stripeId)];
            case 7:
                _c.sent();
                return [4 /*yield*/, db_1.db.transaction.updateMany({ where: { paymentIntentId: stripeId }, data: { status: 'REFUNDED' } })];
            case 8:
                _c.sent();
                _c.label = 9;
            case 9: return [2 /*return*/];
        }
    });
}); };
// ==================================================================
// 🚀 CACHE & SCHEDULER
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
app.post('/api/purchase', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, productId, mobile, amount, unit, paymentId, type, existing, callbackUrl, result, refund, statusId, dbStatus, error_5;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, productId = _a.productId, mobile = _a.mobile, amount = _a.amount, unit = _a.unit, paymentId = _a.paymentId, type = _a.type;
                if (!productId || !mobile || !paymentId)
                    return [2 /*return*/, res.status(400).json({ error: 'Missing required fields' })];
                _b.label = 1;
            case 1:
                _b.trys.push([1, 10, , 12]);
                return [4 /*yield*/, db_1.db.transaction.findFirst({
                        where: { paymentIntentId: paymentId }
                    })];
            case 2:
                existing = _b.sent();
                if (existing) {
                    console.log("[API] Payment ".concat(paymentId, " already processed by webhook."));
                    return [2 /*return*/, res.json(__assign(__assign({ success: existing.status === 'COMPLETED' || existing.status === 'PENDING' }, existing), { dbStatus: existing.status }))];
                }
                callbackUrl = process.env.DTONE_CALLBACK_URL ? "".concat(process.env.DTONE_CALLBACK_URL, "/api/callback") : undefined;
                return [4 /*yield*/, dtone_1.dtoneService.purchaseProduct(productId, mobile, amount || 0, unit, type, callbackUrl)];
            case 3:
                result = _b.sent();
                if (!(!result.success || !result.data)) return [3 /*break*/, 5];
                return [4 /*yield*/, payment_1.paymentService.refundPayment(paymentId)];
            case 4:
                refund = _b.sent();
                return [2 /*return*/, res.status(400).json({ success: false, error: result.error, code: result.code, refunded: !!refund })];
            case 5:
                statusId = result.data.statusId;
                dbStatus = 'PENDING';
                if (!(statusId === 7)) return [3 /*break*/, 6];
                dbStatus = 'COMPLETED';
                return [3 /*break*/, 8];
            case 6:
                if (![3, 9].includes(statusId || 0)) return [3 /*break*/, 8];
                return [4 /*yield*/, payment_1.paymentService.refundPayment(paymentId)];
            case 7:
                _b.sent();
                dbStatus = 'FAILED';
                _b.label = 8;
            case 8: return [4 /*yield*/, db_1.db.transaction.create({
                    data: {
                        externalId: result.data.externalId, paymentIntentId: paymentId, paymentId: paymentId,
                        mobile: mobile,
                        productId: Number(productId), amount: Number(amount || 0),
                        currency: unit || 'UNKNOWN', productType: type || 'UNKNOWN', status: dbStatus
                    }
                })];
            case 9:
                _b.sent();
                return [2 /*return*/, res.json(__assign(__assign({ success: dbStatus === 'COMPLETED' || dbStatus === 'PENDING' }, result.data), { dbStatus: dbStatus }))];
            case 10:
                error_5 = _b.sent();
                return [4 /*yield*/, payment_1.paymentService.refundPayment(paymentId)];
            case 11:
                _b.sent();
                return [2 /*return*/, res.status(500).json({ success: false, error: 'Internal server error', refunded: true })];
            case 12: return [2 /*return*/];
        }
    });
}); });
app.post('/api/callback', function (req, res) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
    res.status(200).send('OK');
    return [2 /*return*/];
}); }); });
var DIST_PATH = path_1.default.join(process.cwd(), 'dist');
app.use(express_1.default.static(DIST_PATH));
app.get(/(.*)/, function (_req, res) { return res.sendFile(path_1.default.join(DIST_PATH, 'index.html')); });
app.listen(Number(PORT), '0.0.0.0', function () { return console.log("\uD83D\uDE80 API Server running on port ".concat(PORT)); });
