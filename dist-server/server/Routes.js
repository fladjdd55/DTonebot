"use strict";
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
var stripe_1 = __importDefault(require("stripe")); // ✅ Import Stripe directly
var dtone_1 = require("./dtone");
var sync_countries_1 = require("./scripts/sync-countries");
var sync_operators_1 = require("./scripts/sync-operators");
var payment_1 = require("./payment");
var db_1 = require("./db");
var app = (0, express_1.default)();
var PORT = process.env.PORT || 5000;
// Initialize Stripe locally for Webhook Verification
var stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16',
});
app.use((0, cors_1.default)());
// ==================================================================
// 💳 STRIPE WEBHOOK (MUST BE BEFORE express.json)
// ==================================================================
// This endpoint catches "Payment Succeeded" events from Stripe directly.
// It acts as a "Fail-Safe" if the user closes their browser before the frontend finishes.
app.post('/api/stripe-webhook', express_1.default.raw({ type: 'application/json' }), // 👈 Catch raw body for signature verification
function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var sig, webhookSecret, event, paymentIntent, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sig = req.headers['stripe-signature'];
                webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
                if (!webhookSecret) {
                    console.error('[Stripe Webhook] ⚠️ STRIPE_WEBHOOK_SECRET is missing in .env');
                    return [2 /*return*/, res.status(500).send('Webhook secret not configured')];
                }
                if (!sig) {
                    return [2 /*return*/, res.status(400).send('Missing signature')];
                }
                try {
                    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
                }
                catch (err) {
                    console.error("[Stripe Webhook] \u26A0\uFE0F Signature Error: ".concat(err.message));
                    return [2 /*return*/, res.status(400).send("Webhook Error: ".concat(err.message))];
                }
                _a.label = 1;
            case 1:
                _a.trys.push([1, 5, , 6]);
                if (!(event.type === 'payment_intent.succeeded')) return [3 /*break*/, 3];
                paymentIntent = event.data.object;
                return [4 /*yield*/, handleFailSafePurchase(paymentIntent)];
            case 2:
                _a.sent();
                return [3 /*break*/, 4];
            case 3:
                if (event.type === 'payment_intent.payment_failed') {
                    console.log("[Stripe Webhook] \u274C Payment Failed: ".concat(event.data.object.id));
                }
                _a.label = 4;
            case 4:
                res.json({ received: true });
                return [3 /*break*/, 6];
            case 5:
                error_1 = _a.sent();
                console.error('[Stripe Webhook] Handler Error:', error_1);
                res.status(500).send('Webhook handler failed');
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); });
// ✅ NOW we can enable JSON parsing for all other routes
app.use(express_1.default.json());
// ==================================================================
// 🧠 FAIL-SAFE FULFILLMENT LOGIC
// ==================================================================
var handleFailSafePurchase = function (paymentIntent) { return __awaiter(void 0, void 0, void 0, function () {
    var stripeId, metadata, existingTx, result, status;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                stripeId = paymentIntent.id;
                metadata = paymentIntent.metadata;
                console.log("[Webhook] \uD83D\uDCB0 Payment ".concat(stripeId, " succeeded. Checking fulfillment..."));
                return [4 /*yield*/, db_1.db.transaction.findFirst({
                        where: { paymentIntentId: stripeId }
                    })];
            case 1:
                existingTx = _c.sent();
                if (existingTx && (existingTx.status === 'COMPLETED' || existingTx.status === 'PENDING')) {
                    console.log("[Webhook] \u2705 Transaction ".concat(existingTx.externalId, " already recorded. Skipping."));
                    return [2 /*return*/];
                }
                // 2. Validate Metadata (Must have mobile/product from server/payment.ts)
                if (!(metadata === null || metadata === void 0 ? void 0 : metadata.mobile) || !(metadata === null || metadata === void 0 ? void 0 : metadata.productId)) {
                    console.warn("[Webhook] \u26A0\uFE0F Missing metadata for ".concat(stripeId, ". Cannot auto-fulfill."));
                    return [2 /*return*/];
                }
                // 3. Fulfill the Order (The "Fail-Safe")
                console.log("[Webhook] \uD83D\uDD04 Initiating fail-safe purchase for ".concat(metadata.mobile, "..."));
                return [4 /*yield*/, dtone_1.dtoneService.purchaseProduct(Number(metadata.productId), metadata.mobile, paymentIntent.amount / 100, // Convert cents back to main unit
                    paymentIntent.currency.toUpperCase(), metadata.type)];
            case 2:
                result = _c.sent();
                status = result.success ? 'COMPLETED' : 'FAILED';
                if (!existingTx) return [3 /*break*/, 4];
                // If record existed but was failed/abandoned, update it
                return [4 /*yield*/, db_1.db.transaction.update({
                        where: { id: existingTx.id },
                        data: { status: status, externalId: ((_a = result.data) === null || _a === void 0 ? void 0 : _a.externalId) || existingTx.externalId }
                    })];
            case 3:
                // If record existed but was failed/abandoned, update it
                _c.sent();
                return [3 /*break*/, 6];
            case 4: 
            // If NO record exists (User closed browser immediately), create it
            return [4 /*yield*/, db_1.db.transaction.create({
                    data: {
                        externalId: ((_b = result.data) === null || _b === void 0 ? void 0 : _b.externalId) || "retry_".concat(Date.now()),
                        paymentIntentId: stripeId,
                        mobile: metadata.mobile,
                        productId: Number(metadata.productId),
                        amount: paymentIntent.amount / 100,
                        currency: paymentIntent.currency.toUpperCase(),
                        productType: metadata.type || 'UNKNOWN',
                        status: status,
                        paymentId: stripeId // Explicitly set paymentId column
                    }
                })];
            case 5:
                // If NO record exists (User closed browser immediately), create it
                _c.sent();
                _c.label = 6;
            case 6:
                if (!!result.success) return [3 /*break*/, 9];
                console.warn("[Webhook] \u26A0\uFE0F Fulfillment failed. Issuing refund for ".concat(stripeId));
                return [4 /*yield*/, payment_1.paymentService.refundPayment(stripeId)];
            case 7:
                _c.sent();
                // Update DB to REFUNDED
                return [4 /*yield*/, db_1.db.transaction.updateMany({
                        where: { paymentIntentId: stripeId },
                        data: { status: 'REFUNDED' }
                    })];
            case 8:
                // Update DB to REFUNDED
                _c.sent();
                return [3 /*break*/, 10];
            case 9:
                console.log("[Webhook] \uD83C\uDF89 Fail-safe purchase successful!");
                _c.label = 10;
            case 10: return [2 /*return*/];
        }
    });
}); };
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
// 🔢 DTONE STATUS CODES
// ==================================================================
var DTONE_STATUS = {
    CREATED: 1,
    CONFIRMED: 2,
    REJECTED: 3,
    CANCELLED: 4,
    SUBMITTED: 5,
    COMPLETED: 7,
    REVERSED: 8,
    DECLINED: 9
};
// ==================================================================
// 🔒 SECURITY HELPER (DTOne Callback)
// ==================================================================
var verifyDtOneCallback = function (req) {
    var authHeader = req.headers.authorization;
    if (!process.env.DTONE_WEBHOOK_USER || !process.env.DTONE_WEBHOOK_PASS)
        return true;
    if (!authHeader)
        return false;
    var _a = authHeader.split(' '), scheme = _a[0], credentials = _a[1];
    if (scheme !== 'Basic' || !credentials)
        return false;
    var _b = Buffer.from(credentials, 'base64').toString().split(':'), user = _b[0], pass = _b[1];
    return user === process.env.DTONE_WEBHOOK_USER && pass === process.env.DTONE_WEBHOOK_PASS;
};
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
    var _a, amount, currency, mobile, productId, type, result, error_2;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, amount = _a.amount, currency = _a.currency, mobile = _a.mobile, productId = _a.productId, type = _a.type;
                if (!amount || !currency)
                    return [2 /*return*/, res.status(400).json({ error: 'Amount and currency are required' })];
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, payment_1.paymentService.createPaymentIntent(amount, currency)];
            case 2:
                result = _b.sent();
                // Note: You must update payment.ts to actually accept and save this metadata!
                res.json(result);
                return [3 /*break*/, 4];
            case 3:
                error_2 = _b.sent();
                res.status(500).json({ error: error_2.message });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.post('/api/lookup', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var mobile, result, error_3;
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
                error_3 = _a.sent();
                return [2 /*return*/, res.status(500).json({ error: error_3.message })];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.post('/api/products', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, operatorId, lang, result, error_4;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, operatorId = _a.operatorId, lang = _a.lang;
                if (!operatorId)
                    return [2 /*return*/, res.status(400).json({ error: 'Operator ID is required' })];
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, dtone_1.dtoneService.getProductsForOperator(operatorId, 1, lang)];
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
app.post('/api/purchase', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, productId, mobile, amount, unit, paymentId, type, dbTransaction, callbackUrl, result, refund_1, statusId, dbStatus, shouldRefund, refund, dbError_1, error_5, refund, refundError_1;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, productId = _a.productId, mobile = _a.mobile, amount = _a.amount, unit = _a.unit, paymentId = _a.paymentId, type = _a.type;
                if (!productId || !mobile || !paymentId) {
                    return [2 /*return*/, res.status(400).json({ error: 'Missing required fields' })];
                }
                dbTransaction = null;
                _b.label = 1;
            case 1:
                _b.trys.push([1, 12, , 17]);
                callbackUrl = process.env.DTONE_CALLBACK_URL
                    ? "".concat(process.env.DTONE_CALLBACK_URL, "/api/callback")
                    : undefined;
                return [4 /*yield*/, dtone_1.dtoneService.purchaseProduct(productId, mobile, amount || 0, unit, type, callbackUrl)];
            case 2:
                result = _b.sent();
                if (!(!result.success || !result.data)) return [3 /*break*/, 4];
                console.error("[Purchase] API Error: ".concat(result.error));
                return [4 /*yield*/, payment_1.paymentService.refundPayment(paymentId)];
            case 3:
                refund_1 = _b.sent();
                return [2 /*return*/, res.status(400).json({
                        success: false,
                        error: result.error,
                        code: result.code,
                        refunded: !!refund_1,
                        refundId: refund_1 === null || refund_1 === void 0 ? void 0 : refund_1.id
                    })];
            case 4:
                statusId = result.data.statusId;
                dbStatus = 'PENDING';
                shouldRefund = false;
                if (statusId === DTONE_STATUS.COMPLETED) {
                    dbStatus = 'COMPLETED';
                }
                else if (statusId === DTONE_STATUS.REJECTED || statusId === DTONE_STATUS.DECLINED) {
                    dbStatus = 'FAILED';
                    shouldRefund = true;
                }
                refund = null;
                if (!shouldRefund) return [3 /*break*/, 6];
                console.warn("[Purchase] \u274C Immediate Failure (Code ".concat(statusId, "). Refunding..."));
                return [4 /*yield*/, payment_1.paymentService.refundPayment(paymentId)];
            case 5:
                refund = _b.sent();
                if (refund)
                    dbStatus = 'REFUNDED';
                _b.label = 6;
            case 6:
                _b.trys.push([6, 8, , 11]);
                return [4 /*yield*/, db_1.db.transaction.create({
                        data: {
                            externalId: result.data.externalId,
                            paymentIntentId: paymentId,
                            paymentId: paymentId,
                            mobile: mobile,
                            productId: Number(productId),
                            amount: Number(amount || 0),
                            currency: unit || 'UNKNOWN',
                            productType: type || 'UNKNOWN',
                            status: dbStatus
                        }
                    })];
            case 7:
                dbTransaction = _b.sent();
                return [3 /*break*/, 11];
            case 8:
                dbError_1 = _b.sent();
                console.error("[DB] CRITICAL: Failed to save transaction:", dbError_1);
                if (!!refund) return [3 /*break*/, 10];
                return [4 /*yield*/, payment_1.paymentService.refundPayment(paymentId)];
            case 9:
                refund = _b.sent();
                _b.label = 10;
            case 10: return [2 /*return*/, res.status(500).json({
                    success: false,
                    error: 'Database error - payment has been refunded',
                    refunded: true,
                    refundId: refund === null || refund === void 0 ? void 0 : refund.id
                })];
            case 11: return [2 /*return*/, res.json(__assign(__assign({ success: dbStatus === 'COMPLETED' || dbStatus === 'PENDING' }, result.data), { dbStatus: dbStatus, refunded: !!refund, refundId: refund === null || refund === void 0 ? void 0 : refund.id }))];
            case 12:
                error_5 = _b.sent();
                console.error('[Purchase] Unexpected error:', error_5);
                _b.label = 13;
            case 13:
                _b.trys.push([13, 15, , 16]);
                return [4 /*yield*/, payment_1.paymentService.refundPayment(paymentId)];
            case 14:
                refund = _b.sent();
                return [2 /*return*/, res.status(500).json({
                        success: false,
                        error: 'Internal server error - payment refunded',
                        refunded: true
                    })];
            case 15:
                refundError_1 = _b.sent();
                return [2 /*return*/, res.status(500).json({ success: false, error: error_5.message })];
            case 16: return [3 /*break*/, 17];
            case 17: return [2 /*return*/];
        }
    });
}); });
// ==================================================================
// 🔔 DTONE CALLBACK (Basic Auth Security)
// ==================================================================
app.post('/api/callback', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var txn, statusId, statusMsg, refId, existingTx, newStatus, _a, e_2;
    var _b, _c, _d, _e, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                if (!verifyDtOneCallback(req)) {
                    console.warn("[Callback] \u26D4 Security blocked request from ".concat(req.ip));
                    res.status(401).json({ error: 'Unauthorized' });
                    return [2 /*return*/];
                }
                txn = req.body;
                statusId = (_c = (_b = txn.status) === null || _b === void 0 ? void 0 : _b.class) === null || _c === void 0 ? void 0 : _c.id;
                statusMsg = ((_d = txn.status) === null || _d === void 0 ? void 0 : _d.message) || 'No details';
                refId = txn.external_id;
                console.log("\n\uD83D\uDD14 [DTOne Callback] Ref: ".concat(refId, " | Code: ").concat(statusId, " (").concat((_f = (_e = txn.status) === null || _e === void 0 ? void 0 : _e.class) === null || _f === void 0 ? void 0 : _f.message, ")"));
                _g.label = 1;
            case 1:
                _g.trys.push([1, 11, , 12]);
                return [4 /*yield*/, db_1.db.transaction.findUnique({ where: { externalId: refId } })];
            case 2:
                existingTx = _g.sent();
                if (!existingTx) {
                    console.warn("   ⚠️ Transaction not found in DB.");
                    res.status(200).send('OK');
                    return [2 /*return*/];
                }
                if (existingTx.status === 'COMPLETED' || existingTx.status === 'REFUNDED') {
                    res.status(200).send('OK');
                    return [2 /*return*/];
                }
                newStatus = existingTx.status;
                _a = statusId;
                switch (_a) {
                    case DTONE_STATUS.COMPLETED: return [3 /*break*/, 3];
                    case DTONE_STATUS.REJECTED: return [3 /*break*/, 4];
                    case DTONE_STATUS.DECLINED: return [3 /*break*/, 4];
                    case DTONE_STATUS.CANCELLED: return [3 /*break*/, 4];
                    case DTONE_STATUS.REVERSED: return [3 /*break*/, 4];
                }
                return [3 /*break*/, 8];
            case 3:
                console.log("   ✅ SUCCESS: Transaction finished successfully.");
                newStatus = 'COMPLETED';
                return [3 /*break*/, 9];
            case 4:
                console.error("   \u274C FAILED: ".concat(statusMsg));
                if (!(existingTx.paymentIntentId && existingTx.status !== 'REFUNDED')) return [3 /*break*/, 6];
                return [4 /*yield*/, payment_1.paymentService.refundPayment(existingTx.paymentIntentId)];
            case 5:
                _g.sent();
                newStatus = 'REFUNDED';
                return [3 /*break*/, 7];
            case 6:
                newStatus = 'FAILED';
                _g.label = 7;
            case 7: return [3 /*break*/, 9];
            case 8:
                console.log("   ⏳ PENDING: Update received.");
                return [3 /*break*/, 9];
            case 9: return [4 /*yield*/, db_1.db.transaction.update({
                    where: { externalId: refId },
                    data: { status: newStatus }
                })];
            case 10:
                _g.sent();
                return [3 /*break*/, 12];
            case 11:
                e_2 = _g.sent();
                console.error("Callback Error:", e_2);
                return [3 /*break*/, 12];
            case 12:
                res.status(200).send('OK');
                return [2 /*return*/];
        }
    });
}); });
// ==================================================================
// 📂 SERVE REACT FRONTEND (MUST BE LAST)
// ==================================================================
var DIST_PATH = path_1.default.join(process.cwd(), 'dist');
app.use(express_1.default.static(DIST_PATH));
app.get(/(.*)/, function (_req, res) {
    res.sendFile(path_1.default.join(DIST_PATH, 'index.html'));
});
app.listen(Number(PORT), '0.0.0.0', function () {
    console.log("\uD83D\uDE80 API Server running on port ".concat(PORT, " (IPv4)"));
});
