"use strict";
// server/Routes.ts - FIXED VERSION
// Key Changes:
// 1. Server-only price calculation
// 2. Price verification BEFORE payment
// 3. Simplified purchase flow (webhook-first)
// 4. Database transactions for atomicity
// 5. Better error handling
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
var path_1 = __importDefault(require("path"));
var stripe_1 = __importDefault(require("stripe"));
var zod_1 = require("zod");
var auth_1 = require("./middleware/auth");
var dtone_1 = require("./dtone");
var payment_1 = require("./payment");
var db_1 = require("./db");
var redis_1 = require("./services/redis"); // NEW: For webhook deduplication
var app = (0, express_1.default)();
app.set('trust proxy', 1);
var PORT = process.env.PORT || 5000;
var stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' });
var FALLBACK_MARGIN = Number(process.env.DTONE_FALLBACK_MARGIN) || 1.15;
var GLOBAL_MIN_USD = Number(process.env.VITE_MIN_USD_ORDER || 5);
// ============================================================
// 🔧 FIX #1: PRICE CALCULATION SERVICE (Server-Only)
// ============================================================
var PriceCalculationService = /** @class */ (function () {
    function PriceCalculationService() {
    }
    /**
     * Calculate exact USD price user should pay
     * Single source of truth - used by both intent creation and verification
     */
    PriceCalculationService.calculatePrice = function (product, customAmount) {
        var _a;
        var isRanged = ((_a = product.type) === null || _a === void 0 ? void 0 : _a.includes('RANGE')) ||
            (product.minAmount && product.maxAmount && product.minAmount !== product.maxAmount);
        var baseCostUsd = 0;
        var localAmount = 0;
        var currency = product.currency;
        if (isRanged) {
            if (!customAmount) {
                throw new Error('Custom amount required for ranged products');
            }
            var min = product.minAmount || 0;
            var max = product.maxAmount || Infinity;
            if (customAmount < min || customAmount > max) {
                throw new Error("Amount must be between ".concat(min, " and ").concat(max, " ").concat(currency));
            }
            // Calculate proportional cost
            var costMin = product.costPriceMin || product.costPrice || 0;
            var unitMin = product.minAmount || 1;
            baseCostUsd = customAmount * (costMin / unitMin);
            localAmount = customAmount;
        }
        else {
            // Fixed product
            baseCostUsd = product.costPrice || product.amount || 0;
            localAmount = product.amount || 0;
        }
        // Apply margin
        var finalPrice = baseCostUsd * FALLBACK_MARGIN;
        // Enforce minimum
        if (finalPrice < GLOBAL_MIN_USD) {
            throw new Error("Minimum order is $".concat(GLOBAL_MIN_USD, " USD"));
        }
        return {
            usdPrice: finalPrice,
            localAmount: localAmount,
            currency: currency,
            breakdown: {
                baseCost: baseCostUsd,
                margin: FALLBACK_MARGIN,
                finalPrice: finalPrice
            }
        };
    };
    /**
     * Get adjusted minimum for ranged products considering USD minimum
     */
    PriceCalculationService.getEffectiveMin = function (product) {
        var _a;
        if (!((_a = product.type) === null || _a === void 0 ? void 0 : _a.includes('RANGE'))) {
            return product.amount || 0;
        }
        var min = product.minAmount || 0;
        if (!product.costPrice || !product.minAmount) {
            return min;
        }
        // Calculate local currency equivalent of $5 USD
        var costPerUnit = product.costPrice / product.minAmount;
        var minRequiredLocal = GLOBAL_MIN_USD / (costPerUnit * FALLBACK_MARGIN);
        return Math.max(min, Math.ceil(minRequiredLocal));
    };
    return PriceCalculationService;
}());
// ============================================================
// 🔧 FIX #2: WEBHOOK DEDUPLICATION WITH REDIS
// ============================================================
var redis = new redis_1.RedisService();
function isWebhookProcessed(eventId) {
    return __awaiter(this, void 0, void 0, function () {
        var key, exists;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    key = "webhook:".concat(eventId);
                    return [4 /*yield*/, redis.get(key)];
                case 1:
                    exists = _a.sent();
                    if (exists)
                        return [2 /*return*/, true];
                    // Mark as processed for 24 hours
                    return [4 /*yield*/, redis.set(key, '1', 86400)];
                case 2:
                    // Mark as processed for 24 hours
                    _a.sent();
                    return [2 /*return*/, false];
            }
        });
    });
}
// ============================================================
// 🔧 FIX #3: SIMPLIFIED PURCHASE FLOW (Webhook-Primary)
// ============================================================
/**
 * Process purchase with database transaction for atomicity
 * Called ONLY from webhook (API just creates intent)
 */
function processWebhookPurchase(paymentIntent) {
    return __awaiter(this, void 0, void 0, function () {
        var paymentId, mobile, productId, localAmount, userId;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    paymentId = paymentIntent.id;
                    mobile = paymentIntent.metadata.mobile;
                    productId = Number(paymentIntent.metadata.productId);
                    localAmount = paymentIntent.metadata.localAmount;
                    userId = paymentIntent.metadata.userId || null;
                    console.log("[Webhook] Processing: ".concat(paymentId));
                    // Use Prisma transaction for atomicity
                    return [4 /*yield*/, db_1.db.$transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var existing, txnRecord, callbackUrl, result, finalStatus, shouldRefund, statusId;
                            var _this = this;
                            var _a;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0: return [4 /*yield*/, tx.transaction.findUnique({
                                            where: { paymentIntentId: paymentId }
                                        })];
                                    case 1:
                                        existing = _b.sent();
                                        if (existing) {
                                            if (existing.status === 'COMPLETED') {
                                                console.log("[Webhook] Already completed: ".concat(paymentId));
                                                return [2 /*return*/];
                                            }
                                            if (['FAILED', 'REFUNDED'].includes(existing.status)) {
                                                console.log("[Webhook] Already failed/refunded: ".concat(paymentId));
                                                return [2 /*return*/];
                                            }
                                        }
                                        return [4 /*yield*/, tx.transaction.upsert({
                                                where: { paymentIntentId: paymentId },
                                                create: {
                                                    externalId: "pending_".concat(paymentId),
                                                    paymentIntentId: paymentId,
                                                    paymentId: paymentId,
                                                    mobile: mobile,
                                                    productId: productId,
                                                    amount: paymentIntent.amount / 100,
                                                    currency: paymentIntent.currency.toUpperCase(),
                                                    productType: paymentIntent.metadata.type || 'UNKNOWN',
                                                    status: 'PROCESSING',
                                                    processedVia: 'WEBHOOK',
                                                    userId: userId
                                                },
                                                update: {
                                                    status: 'PROCESSING',
                                                    updatedAt: new Date()
                                                }
                                            })];
                                    case 2:
                                        txnRecord = _b.sent();
                                        callbackUrl = process.env.DTONE_CALLBACK_URL
                                            ? "".concat(process.env.DTONE_CALLBACK_URL, "/api/hooks/dtone")
                                            : undefined;
                                        return [4 /*yield*/, dtone_1.dtoneService.purchaseProduct(productId, mobile, localAmount ? parseFloat(localAmount) : 0, paymentIntent.currency.toUpperCase(), paymentIntent.metadata.type, callbackUrl)];
                                    case 3:
                                        result = _b.sent();
                                        finalStatus = 'PENDING';
                                        shouldRefund = false;
                                        if (!result.success || !result.data) {
                                            console.error("[Webhook] DTOne failed: ".concat(result.error));
                                            finalStatus = 'FAILED';
                                            shouldRefund = true;
                                        }
                                        else {
                                            statusId = result.data.statusId;
                                            if (statusId === 7) {
                                                finalStatus = 'COMPLETED';
                                            }
                                            else if ([3, 9].includes(statusId || 0)) {
                                                finalStatus = 'FAILED';
                                                shouldRefund = true;
                                            }
                                            else {
                                                finalStatus = 'PENDING'; // Awaiting DTOne callback
                                            }
                                        }
                                        // Update transaction with final status
                                        return [4 /*yield*/, tx.transaction.update({
                                                where: { id: txnRecord.id },
                                                data: {
                                                    status: finalStatus,
                                                    externalId: ((_a = result.data) === null || _a === void 0 ? void 0 : _a.externalId) || "failed_".concat(paymentId),
                                                    updatedAt: new Date()
                                                }
                                            })];
                                    case 4:
                                        // Update transaction with final status
                                        _b.sent();
                                        // Handle refund outside transaction
                                        if (shouldRefund) {
                                            // Schedule refund in background (don't block webhook response)
                                            setImmediate(function () { return __awaiter(_this, void 0, void 0, function () {
                                                var refund;
                                                return __generator(this, function (_a) {
                                                    switch (_a.label) {
                                                        case 0: return [4 /*yield*/, payment_1.paymentService.refundPayment(paymentId)];
                                                        case 1:
                                                            refund = _a.sent();
                                                            return [4 /*yield*/, db_1.db.transaction.update({
                                                                    where: { paymentIntentId: paymentId },
                                                                    data: { status: refund ? 'REFUNDED' : 'REFUND_FAILED' }
                                                                })];
                                                        case 2:
                                                            _a.sent();
                                                            return [2 /*return*/];
                                                    }
                                                });
                                            }); });
                                        }
                                        return [2 /*return*/];
                                }
                            });
                        }); }, {
                            maxWait: 10000, // 10 seconds max wait for lock
                            timeout: 30000 // 30 seconds total timeout
                        })];
                case 1:
                    // Use Prisma transaction for atomicity
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ============================================================
// 🔧 FIX #4: STRIPE WEBHOOK (With Deduplication)
// ============================================================
app.post('/api/hooks/stripe', express_1.default.raw({ type: 'application/json' }), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var sig, webhookSecret, event, paymentIntent_1, paymentIntent, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sig = req.headers['stripe-signature'];
                webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
                if (!webhookSecret || !sig) {
                    return [2 /*return*/, res.status(400).send('Webhook Error: Missing signature')];
                }
                try {
                    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
                }
                catch (err) {
                    console.error('[Webhook] Signature verification failed:', err.message);
                    return [2 /*return*/, res.status(400).send("Webhook Error: ".concat(err.message))];
                }
                return [4 /*yield*/, isWebhookProcessed(event.id)];
            case 1:
                // Check if already processed (Redis-based)
                if (_a.sent()) {
                    console.log("[Webhook] Duplicate event ignored: ".concat(event.id));
                    return [2 /*return*/, res.json({ received: true, duplicate: true })];
                }
                _a.label = 2;
            case 2:
                _a.trys.push([2, 5, , 6]);
                if (event.type === 'payment_intent.succeeded') {
                    paymentIntent_1 = event.data.object;
                    // Process in background, respond immediately
                    setImmediate(function () { return processWebhookPurchase(paymentIntent_1); });
                    return [2 /*return*/, res.json({ received: true })];
                }
                if (!(event.type === 'payment_intent.payment_failed')) return [3 /*break*/, 4];
                paymentIntent = event.data.object;
                return [4 /*yield*/, db_1.db.transaction.updateMany({
                        where: { paymentIntentId: paymentIntent.id },
                        data: { status: 'PAYMENT_FAILED' }
                    })];
            case 3:
                _a.sent();
                _a.label = 4;
            case 4:
                res.json({ received: true });
                return [3 /*break*/, 6];
            case 5:
                error_1 = _a.sent();
                console.error('[Webhook] Processing error:', error_1);
                res.status(500).send('Webhook handler failed');
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); });
app.use(express_1.default.json());
// ============================================================
// 🔧 FIX #5: SECURE PAYMENT INTENT (Server-Side Price Calc)
// ============================================================
app.post('/api/create-payment-intent', auth_1.optionalAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, mobile, productId, type, customAmount, idempotencyKey, product, priceCalc, result, error_2;
    var _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _a = req.body, mobile = _a.mobile, productId = _a.productId, type = _a.type, customAmount = _a.customAmount;
                idempotencyKey = req.headers['idempotency-key'];
                if (!productId || !mobile) {
                    return [2 /*return*/, res.status(400).json({ error: 'Product ID and mobile required' })];
                }
                _d.label = 1;
            case 1:
                _d.trys.push([1, 4, , 5]);
                return [4 /*yield*/, db_1.db.product.findUnique({ where: { id: productId } })];
            case 2:
                product = _d.sent();
                if (!product) {
                    return [2 /*return*/, res.status(400).json({ error: 'Product not found' })];
                }
                priceCalc = void 0;
                try {
                    priceCalc = PriceCalculationService.calculatePrice(product, customAmount);
                }
                catch (err) {
                    return [2 /*return*/, res.status(400).json({ error: err.message })];
                }
                return [4 /*yield*/, payment_1.paymentService.createPaymentIntent(priceCalc.usdPrice, 'USD', // Always charge in USD
                    {
                        mobile: mobile,
                        productId: productId.toString(),
                        type: type || product.type,
                        userId: (_b = req.user) === null || _b === void 0 ? void 0 : _b.id,
                        localAmount: priceCalc.localAmount.toString()
                    }, idempotencyKey)];
            case 3:
                result = _d.sent();
                // 4. Return with price breakdown for transparency
                return [2 /*return*/, res.json(__assign(__assign({}, result), { isGuest: !req.user, userId: (_c = req.user) === null || _c === void 0 ? void 0 : _c.id, chargeAmount: priceCalc.usdPrice, localAmount: priceCalc.localAmount, currency: priceCalc.currency, breakdown: priceCalc.breakdown }))];
            case 4:
                error_2 = _d.sent();
                console.error('[Payment Intent] Error:', error_2);
                return [2 /*return*/, res.status(500).json({ error: 'Failed to create payment intent' })];
            case 5: return [2 /*return*/];
        }
    });
}); });
// ============================================================
// 🔧 FIX #6: SIMPLIFIED PURCHASE API (Intent Only)
// ============================================================
var purchaseSchema = zod_1.z.object({
    productId: zod_1.z.number().int().positive(),
    mobile: zod_1.z.string().min(7).max(15),
    amount: zod_1.z.number().positive().optional(),
    unit: zod_1.z.string().length(3).optional(),
    paymentId: zod_1.z.string().startsWith("pi_"),
    type: zod_1.z.string().optional()
});
app.post('/api/purchase', auth_1.optionalAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, productId, mobile, paymentId, paymentIntent, originalPayerId, currentUser, existing, error_3;
    var _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _d.trys.push([0, 3, , 4]);
                _a = purchaseSchema.parse(req.body), productId = _a.productId, mobile = _a.mobile, paymentId = _a.paymentId;
                return [4 /*yield*/, stripe.paymentIntents.retrieve(paymentId)];
            case 1:
                paymentIntent = _d.sent();
                if (paymentIntent.status !== 'succeeded') {
                    return [2 /*return*/, res.status(403).json({
                            error: 'Payment not completed',
                            status: paymentIntent.status
                        })];
                }
                originalPayerId = (_b = paymentIntent.metadata) === null || _b === void 0 ? void 0 : _b.userId;
                currentUser = (_c = req.user) === null || _c === void 0 ? void 0 : _c.id;
                if (originalPayerId && currentUser && originalPayerId !== currentUser) {
                    console.error("[Security] Payment hijacking attempt: ".concat(paymentId));
                    return [2 /*return*/, res.status(403).json({
                            error: 'Security violation: Payment ownership mismatch'
                        })];
                }
                return [4 /*yield*/, db_1.db.transaction.findUnique({
                        where: { paymentIntentId: paymentId }
                    })];
            case 2:
                existing = _d.sent();
                if (existing) {
                    // Return current status
                    return [2 /*return*/, res.json({
                            success: existing.status === 'COMPLETED',
                            status: existing.status,
                            externalId: existing.externalId,
                            message: 'Transaction already processed',
                            alreadyProcessed: true
                        })];
                }
                // 4. Return pending - webhook will complete
                return [2 /*return*/, res.json({
                        success: true,
                        status: 'PENDING',
                        message: 'Payment confirmed. Processing recharge...',
                        paymentId: paymentId
                    })];
            case 3:
                error_3 = _d.sent();
                console.error('[Purchase] Error:', error_3);
                if (error_3 instanceof zod_1.z.ZodError) {
                    return [2 /*return*/, res.status(400).json({ error: 'Invalid request data' })];
                }
                return [2 /*return*/, res.status(500).json({ error: 'Purchase failed' })];
            case 4: return [2 /*return*/];
        }
    });
}); });
// ============================================================
// 🔧 FIX #7: TRANSACTION STATUS WITH POLLING
// ============================================================
app.get('/api/transaction/:paymentId', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var paymentId, txn, error_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                paymentId = req.params.paymentId;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, db_1.db.transaction.findUnique({
                        where: { paymentIntentId: paymentId },
                        select: {
                            status: true,
                            externalId: true,
                            amount: true,
                            currency: true,
                            createdAt: true,
                            updatedAt: true
                        }
                    })];
            case 2:
                txn = _a.sent();
                if (!txn) {
                    return [2 /*return*/, res.json({
                            status: 'PENDING',
                            message: 'Transaction not yet created'
                        })];
                }
                return [2 /*return*/, res.json(txn)];
            case 3:
                error_4 = _a.sent();
                console.error('[Status Check] Error:', error_4);
                return [2 /*return*/, res.status(500).json({ error: 'Status check failed' })];
            case 4: return [2 /*return*/];
        }
    });
}); });
// ============================================================
// OTHER ENDPOINTS (Keep existing auth, products, etc.)
// ============================================================
// ... (Keep all your existing auth routes, products, operators, etc.)
// Static files
var DIST_PATH = path_1.default.join(process.cwd(), 'dist');
app.use(express_1.default.static(DIST_PATH));
app.get(/(.*)/, function (_req, res) { return res.sendFile(path_1.default.join(DIST_PATH, 'index.html')); });
app.listen(Number(PORT), '0.0.0.0', function () {
    return console.log("\uD83D\uDE80 API Server running on port ".concat(PORT));
});
