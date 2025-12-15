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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var cors_1 = __importDefault(require("cors"));
var path_1 = __importDefault(require("path"));
var stripe_1 = __importDefault(require("stripe"));
var node_cron_1 = __importDefault(require("node-cron"));
var express_rate_limit_1 = __importDefault(require("express-rate-limit"));
var helmet_1 = __importDefault(require("helmet"));
var cookie_parser_1 = __importDefault(require("cookie-parser")); // ✅ NEW: Cookie Parser
var zod_1 = require("zod");
var auth_1 = require("./middleware/auth");
// Services
var dtone_1 = require("./dtone");
var sync_countries_1 = require("./scripts/sync-countries");
var sync_operators_1 = require("./scripts/sync-operators");
var sync_products_1 = require("./scripts/sync-products");
var payment_1 = require("./payment");
var auth_2 = require("./auth");
var priceVerification_1 = require("./priceVerification");
var db_1 = require("./db");
var app = (0, express_1.default)();
// Trust Proxy
app.set('trust proxy', 1);
var PORT = process.env.PORT || 5000;
var stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' });
// ✅ CONFIG: Global Profit Margin (1.15 = 15%)
var FALLBACK_MARGIN = Number(process.env.DTONE_FALLBACK_MARGIN) || 1.15;
var GLOBAL_MIN_USD = Number(process.env.VITE_MIN_USD_ORDER || 5);
// ==================================================================
// 🔒 SECURITY CONFIGURATION
// ==================================================================
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
            frameSrc: ["https://js.stripe.com"],
            connectSrc: ["'self'", "https://api.stripe.com", "ws:", "wss:"],
            imgSrc: ["'self'", "data:", "https:"]
        }
    }
}));
var allowedOrigins = process.env.NODE_ENV === 'production'
    ? (((_a = process.env.ALLOWED_ORIGINS) === null || _a === void 0 ? void 0 : _a.split(',').map(function (o) { return o.trim(); })) || [])
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://127.0.0.1:5173'];
var isValidOrigin = function (origin) {
    try {
        var url = new URL(origin);
        if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
            return false;
        }
        return allowedOrigins.includes(origin);
    }
    catch (error) {
        return false;
    }
};
app.use((0, cors_1.default)({
    origin: function (origin, callback) {
        if (!origin)
            return callback(null, true);
        if (isValidOrigin(origin))
            return callback(null, true);
        console.warn("\uD83D\uDEAB CORS Blocked: ".concat(origin));
        callback(new Error("CORS policy: Origin ".concat(origin, " is not allowed")));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'stripe-signature', 'idempotency-key'],
    exposedHeaders: ['Content-Length', 'X-Request-Id'],
    maxAge: 86400
}));
// ✅ NEW: Enable Cookie Parser (Must be before routes)
app.use((0, cookie_parser_1.default)());
var apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: { error: "Too many requests, please try again later." }
});
var authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many login attempts. Please try again later." }
});
app.use('/api/', apiLimiter);
var processedWebhooks = new Set();
// ==================================================================
// 🧩 UNIFIED PURCHASE LOGIC (WITH SECURITY FIXES)
// ==================================================================
function processPurchase(data_1) {
    return __awaiter(this, arguments, void 0, function (data, source) {
        var paymentId, mobile, productId, amount, currency, type, userId, existing, ageMs, err_1, check, callbackUrl, result, refund, statusId, dbStatus;
        if (source === void 0) { source = 'API'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    paymentId = data.paymentId, mobile = data.mobile, productId = data.productId, amount = data.amount, currency = data.currency, type = data.type, userId = data.userId;
                    return [4 /*yield*/, db_1.db.transaction.findUnique({
                            where: { paymentIntentId: paymentId }
                        })];
                case 1:
                    existing = _a.sent();
                    if (existing) {
                        if (existing.status === 'COMPLETED') {
                            console.log("[Purchase] \u23ED\uFE0F Already completed: ".concat(paymentId));
                            return [2 /*return*/, __assign(__assign({ success: true }, existing), { dbStatus: 'COMPLETED', alreadyProcessed: true })];
                        }
                        if (existing.status === 'REFUNDED' || existing.status === 'FAILED') {
                            console.log("[Purchase] \u23ED\uFE0F Already failed/refunded: ".concat(paymentId));
                            return [2 /*return*/, __assign(__assign({ success: false }, existing), { dbStatus: existing.status, alreadyProcessed: true })];
                        }
                        if (existing.status === 'PENDING') {
                            ageMs = Date.now() - new Date(existing.createdAt).getTime();
                            if (ageMs < 60000) {
                                console.log("[Purchase] \u23ED\uFE0F Already being processed (".concat(Math.round(ageMs / 1000), "s old), backing off"));
                                return [2 /*return*/, { success: true, dbStatus: 'PENDING', alreadyProcessed: true }];
                            }
                        }
                    }
                    if (!!existing) return [3 /*break*/, 7];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 7]);
                    return [4 /*yield*/, db_1.db.transaction.create({
                            data: {
                                externalId: "pending_".concat(paymentId),
                                paymentIntentId: paymentId,
                                paymentId: paymentId,
                                mobile: mobile,
                                productId: productId,
                                amount: amount,
                                currency: currency,
                                productType: type,
                                status: 'PENDING',
                                processedVia: source,
                                userId: userId || null
                            }
                        })];
                case 3:
                    _a.sent();
                    console.log("[Purchase] \uD83D\uDD12 Lock acquired via ".concat(source, ": ").concat(paymentId));
                    return [3 /*break*/, 7];
                case 4:
                    err_1 = _a.sent();
                    if (!(err_1.code === 'P2002')) return [3 /*break*/, 6];
                    return [4 /*yield*/, db_1.db.transaction.findUnique({ where: { paymentIntentId: paymentId } })];
                case 5:
                    check = _a.sent();
                    return [2 /*return*/, { success: (check === null || check === void 0 ? void 0 : check.status) === 'COMPLETED', dbStatus: check === null || check === void 0 ? void 0 : check.status, alreadyProcessed: true }];
                case 6: throw err_1;
                case 7:
                    callbackUrl = process.env.DTONE_CALLBACK_URL
                        ? "".concat(process.env.DTONE_CALLBACK_URL, "/api/hooks/dtone")
                        : undefined;
                    return [4 /*yield*/, dtone_1.dtoneService.purchaseProduct(productId, mobile, amount, currency, type, callbackUrl)];
                case 8:
                    result = _a.sent();
                    if (!(!result.success || !result.data)) return [3 /*break*/, 11];
                    console.error("[Purchase] \u274C DTOne Error: ".concat(result.error));
                    return [4 /*yield*/, payment_1.paymentService.refundPayment(paymentId)];
                case 9:
                    refund = _a.sent();
                    return [4 /*yield*/, db_1.db.transaction.update({
                            where: { paymentIntentId: paymentId },
                            data: { status: refund ? 'REFUNDED' : 'REFUND_FAILED', externalId: "failed_".concat(paymentId) }
                        })];
                case 10:
                    _a.sent();
                    return [2 /*return*/, { success: false, error: result.error, code: result.code, refunded: !!refund }];
                case 11:
                    statusId = result.data.statusId;
                    dbStatus = 'PENDING';
                    if (!(statusId === 7)) return [3 /*break*/, 12];
                    dbStatus = 'COMPLETED';
                    console.log("[Purchase] \u2705 Success! DTOne Ref: ".concat(result.data.externalId));
                    return [3 /*break*/, 15];
                case 12:
                    if (![3, 9].includes(statusId || 0)) return [3 /*break*/, 14];
                    console.warn("[Purchase] \u26A0\uFE0F Declined (Status ".concat(statusId, "). Refunding..."));
                    return [4 /*yield*/, payment_1.paymentService.refundPayment(paymentId)];
                case 13:
                    _a.sent();
                    dbStatus = 'FAILED';
                    return [3 /*break*/, 15];
                case 14:
                    console.log("[Purchase] \u23F3 Submitted (Status ".concat(statusId, "). Awaiting callback."));
                    _a.label = 15;
                case 15: return [4 /*yield*/, db_1.db.transaction.update({
                        where: { paymentIntentId: paymentId },
                        data: { status: dbStatus, externalId: result.data.externalId }
                    })];
                case 16:
                    _a.sent();
                    return [2 /*return*/, __assign(__assign({ success: dbStatus === 'COMPLETED' || dbStatus === 'PENDING' }, result.data), { dbStatus: dbStatus, refunded: dbStatus === 'FAILED' })];
            }
        });
    });
}
// ==================================================================
// STRIPE WEBHOOK
// ==================================================================
app.post('/api/hooks/stripe', express_1.default.raw({ type: 'application/json' }), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var sig, webhookSecret, event, paymentIntent, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sig = req.headers['stripe-signature'];
                webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
                if (!webhookSecret || !sig)
                    return [2 /*return*/, res.status(400).send('Webhook Error')];
                try {
                    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
                }
                catch (err) {
                    return [2 /*return*/, res.status(400).send("Webhook Error: ".concat(err.message))];
                }
                if (processedWebhooks.has(event.id))
                    return [2 /*return*/, res.json({ received: true })];
                processedWebhooks.add(event.id);
                setTimeout(function () { return processedWebhooks.delete(event.id); }, 24 * 60 * 60 * 1000);
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, , 5]);
                if (!(event.type === 'payment_intent.succeeded')) return [3 /*break*/, 3];
                paymentIntent = event.data.object;
                return [4 /*yield*/, processPurchase({
                        paymentId: paymentIntent.id,
                        mobile: paymentIntent.metadata.mobile,
                        productId: Number(paymentIntent.metadata.productId),
                        amount: paymentIntent.amount / 100,
                        currency: paymentIntent.currency.toUpperCase(),
                        type: paymentIntent.metadata.type || 'UNKNOWN',
                        userId: paymentIntent.metadata.userId || undefined
                    }, 'WEBHOOK')];
            case 2:
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
app.use(express_1.default.json());
// ==================================================================
// CACHE & SCHEDULER
// ==================================================================
var COUNTRY_CACHE = [];
var OPERATOR_CACHE = [];
var initializeCache = function () { return __awaiter(void 0, void 0, void 0, function () {
    var c, o, e_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 5, , 6]);
                return [4 /*yield*/, (0, sync_countries_1.syncCountries)()];
            case 1:
                c = _a.sent();
                if (c)
                    COUNTRY_CACHE = c;
                return [4 /*yield*/, (0, sync_operators_1.syncOperators)()];
            case 2:
                o = _a.sent();
                if (o)
                    OPERATOR_CACHE = o;
                if (!(process.env.SYNC_ON_STARTUP === 'true')) return [3 /*break*/, 4];
                return [4 /*yield*/, (0, sync_products_1.syncProducts)()];
            case 3:
                _a.sent();
                _a.label = 4;
            case 4: return [3 /*break*/, 6];
            case 5:
                e_1 = _a.sent();
                console.error("Cache init failed", e_1);
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); };
initializeCache();
node_cron_1.default.schedule('0 3 * * *', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log('[Scheduler] 🌙 Daily Sync...');
                return [4 /*yield*/, Promise.all([(0, sync_countries_1.syncCountries)(), (0, sync_operators_1.syncOperators)(), (0, sync_products_1.syncProducts)()])];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
// ==================================================================
// VALIDATION SCHEMAS
// ==================================================================
var purchaseSchema = zod_1.z.object({
    productId: zod_1.z.number().int().positive(),
    mobile: zod_1.z.string().min(7).max(15),
    amount: zod_1.z.number().positive(), // This is the paid amount from client (for verification only)
    unit: zod_1.z.string().length(3).optional(),
    paymentId: zod_1.z.string().startsWith("pi_"),
    type: zod_1.z.string().optional()
});
var registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    name: zod_1.z.string().min(1).optional()
});
var loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1)
});
// ==================================================================
// 🔐 AUTHENTICATION ROUTES (COOKIE BASED)
// ==================================================================
app.post('/api/auth/register', authLimiter, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, email, password, name_1, result, error_2;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                _a = registerSchema.parse(req.body), email = _a.email, password = _a.password, name_1 = _a.name;
                return [4 /*yield*/, auth_2.authService.register(email, password, name_1)];
            case 1:
                result = _b.sent();
                if (!result.success)
                    return [2 /*return*/, res.status(400).json({ error: result.error })];
                // ✅ Secure HTTP-Only Cookie
                res.cookie('auth_token', result.token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
                });
                return [2 /*return*/, res.status(201).json({ message: 'Registration successful', user: result.user })];
            case 2:
                error_2 = _b.sent();
                return [2 /*return*/, res.status(400).json({ error: 'Registration failed' })];
            case 3: return [2 /*return*/];
        }
    });
}); });
app.post('/api/auth/login', authLimiter, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, email, password, result, error_3;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                _a = loginSchema.parse(req.body), email = _a.email, password = _a.password;
                return [4 /*yield*/, auth_2.authService.login(email, password)];
            case 1:
                result = _b.sent();
                if (!result.success)
                    return [2 /*return*/, res.status(401).json({ error: result.error })];
                // ✅ Secure HTTP-Only Cookie
                res.cookie('auth_token', result.token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 7 * 24 * 60 * 60 * 1000
                });
                return [2 /*return*/, res.json({ message: 'Login successful', user: result.user })];
            case 2:
                error_3 = _b.sent();
                return [2 /*return*/, res.status(500).json({ error: 'Login failed' })];
            case 3: return [2 /*return*/];
        }
    });
}); });
app.post('/api/auth/logout', function (req, res) {
    res.clearCookie('auth_token');
    res.json({ message: 'Logged out successfully' });
});
app.get('/api/auth/me', auth_1.requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, res.json({ user: req.user })];
    });
}); });
app.put('/api/auth/profile', auth_1.requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, auth_2.authService.updateProfile(req.user.id, req.body)];
            case 1:
                result = _a.sent();
                return [2 /*return*/, result.success ? res.json({ user: result.user }) : res.status(400).json({ error: result.error })];
        }
    });
}); });
app.post('/api/auth/change-password', auth_1.requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, currentPassword, newPassword, result;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, currentPassword = _a.currentPassword, newPassword = _a.newPassword;
                return [4 /*yield*/, auth_2.authService.changePassword(req.user.id, currentPassword, newPassword)];
            case 1:
                result = _b.sent();
                return [2 /*return*/, result.success ? res.json({ message: 'Password changed' }) : res.status(400).json({ error: result.error })];
        }
    });
}); });
app.get('/api/user/transactions', auth_1.requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var page, limit, skip, _a, transactions, total;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                page = parseInt(req.query.page) || 1;
                limit = 20;
                skip = (page - 1) * limit;
                return [4 /*yield*/, Promise.all([
                        db_1.db.transaction.findMany({
                            where: { userId: req.user.id },
                            orderBy: { createdAt: 'desc' },
                            skip: skip,
                            take: limit
                        }),
                        db_1.db.transaction.count({ where: { userId: req.user.id } })
                    ])];
            case 1:
                _a = _b.sent(), transactions = _a[0], total = _a[1];
                return [2 /*return*/, res.json({ transactions: transactions, pagination: { page: page, limit: limit, total: total } })];
        }
    });
}); });
// ==================================================================
// PUBLIC API ROUTES
// ==================================================================
app.get('/api/countries', function (_req, res) { return res.json(COUNTRY_CACHE); });
app.get('/api/operators', function (req, res) {
    var country = req.query.country;
    res.json(country ? OPERATOR_CACHE.filter(function (op) { return op.countryCode === String(country).toUpperCase(); }) : OPERATOR_CACHE);
});
app.get('/api/products', function (req, res) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
    return [2 /*return*/];
}); }); });
app.post('/api/lookup', function (req, res) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
    return [2 /*return*/];
}); }); });
// ==================================================================
// 🔐 SECURE PAYMENT INTENT (SERVER-SIDE PRICE CALCULATION)
// ==================================================================
app.post('/api/create-payment-intent', auth_1.optionalAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, currency, mobile, productId, type, customAmount, idempotencyKey, product, baseCostUsd, isRanged, min, max, costMin, unitMin, finalCharge, result, error_4;
    var _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _a = req.body, currency = _a.currency, mobile = _a.mobile, productId = _a.productId, type = _a.type, customAmount = _a.customAmount;
                idempotencyKey = req.headers['idempotency-key'];
                if (!productId)
                    return [2 /*return*/, res.status(400).json({ error: 'Product ID required' })];
                _d.label = 1;
            case 1:
                _d.trys.push([1, 4, , 5]);
                return [4 /*yield*/, db_1.db.product.findUnique({ where: { id: productId } })];
            case 2:
                product = _d.sent();
                if (!product)
                    return [2 /*return*/, res.status(400).json({ error: 'Invalid product' })];
                baseCostUsd = 0;
                isRanged = product.type.includes('RANGE') || (product.minAmount && product.maxAmount);
                if (isRanged) {
                    if (!customAmount)
                        return [2 /*return*/, res.status(400).json({ error: 'Custom amount required' })];
                    min = product.minAmount || 0;
                    max = product.maxAmount || Infinity;
                    if (customAmount < min || customAmount > max) {
                        return [2 /*return*/, res.status(400).json({ error: "Amount must be between ".concat(min, " and ").concat(max) })];
                    }
                    costMin = product.costPriceMin || product.costPrice || 0;
                    unitMin = product.minAmount || 1;
                    baseCostUsd = customAmount * (costMin / unitMin);
                }
                else {
                    // Fixed Product
                    baseCostUsd = product.costPrice || product.amount || 0;
                }
                finalCharge = baseCostUsd * FALLBACK_MARGIN;
                if (finalCharge < GLOBAL_MIN_USD) {
                    return [2 /*return*/, res.status(400).json({ error: "Minimum order is $".concat(GLOBAL_MIN_USD, " USD") })];
                }
                return [4 /*yield*/, payment_1.paymentService.createPaymentIntent(finalCharge, 'USD', // Force USD
                    {
                        mobile: mobile,
                        productId: productId.toString(),
                        type: type,
                        userId: (_b = req.user) === null || _b === void 0 ? void 0 : _b.id, // Securely attach User ID
                        localAmount: isRanged ? customAmount.toString() : (product.amount || 0).toString()
                    }, idempotencyKey)];
            case 3:
                result = _d.sent();
                res.json(__assign(__assign({}, result), { isGuest: !req.user, userId: (_c = req.user) === null || _c === void 0 ? void 0 : _c.id }));
                return [3 /*break*/, 5];
            case 4:
                error_4 = _d.sent();
                res.status(500).json({ error: error_4.message });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
// ==================================================================
// 🔐 SECURE PURCHASE API (BLOCKS ATTACKS)
// ==================================================================
app.post('/api/purchase', auth_1.optionalAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, productId, mobile, amount, unit, paymentId, type, paymentIntent, originalPayerId, currentUser, finalUserId, paidAmount, paidCurrency, priceCheck, e_2, result, error_5;
    var _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _d.trys.push([0, 9, , 10]);
                _a = purchaseSchema.parse(req.body), productId = _a.productId, mobile = _a.mobile, amount = _a.amount, unit = _a.unit, paymentId = _a.paymentId, type = _a.type;
                return [4 /*yield*/, stripe.paymentIntents.retrieve(paymentId)];
            case 1:
                paymentIntent = _d.sent();
                if (paymentIntent.status !== 'succeeded') {
                    return [2 /*return*/, res.status(403).json({ error: 'Payment not completed.' })];
                }
                originalPayerId = (_b = paymentIntent.metadata) === null || _b === void 0 ? void 0 : _b.userId;
                currentUser = (_c = req.user) === null || _c === void 0 ? void 0 : _c.id;
                if (originalPayerId && currentUser && originalPayerId !== currentUser) {
                    console.error("[Security] \uD83D\uDEA8 Account Mismatch: Payment belongs to ".concat(originalPayerId, ", claimed by ").concat(currentUser));
                    return [2 /*return*/, res.status(403).json({ error: 'Security Violation: Payment ownership mismatch.' })];
                }
                finalUserId = originalPayerId || undefined;
                paidAmount = paymentIntent.amount / 100;
                paidCurrency = paymentIntent.currency.toUpperCase();
                return [4 /*yield*/, priceVerification_1.priceVerificationService.verifyProductPrice(productId, paidAmount, paidCurrency)];
            case 2:
                priceCheck = _d.sent();
                if (!(!priceCheck.valid && !['CACHE_MISS', 'NO_PRICE'].includes(priceCheck.code || ''))) return [3 /*break*/, 7];
                console.error("[Security] \uD83D\uDEA8 BLOCKED: Price mismatch for ".concat(paymentId, ". Paid: ").concat(paidAmount, ", Expected: ").concat(priceCheck.expectedPrice));
                _d.label = 3;
            case 3:
                _d.trys.push([3, 5, , 6]);
                return [4 /*yield*/, payment_1.paymentService.refundPayment(paymentId)];
            case 4:
                _d.sent();
                return [3 /*break*/, 6];
            case 5:
                e_2 = _d.sent();
                console.error('Refund failed:', e_2);
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/, res.status(403).json({ error: 'Price verification failed. Payment refunded.' })];
            case 7: return [4 /*yield*/, processPurchase({
                    paymentId: paymentId,
                    mobile: mobile,
                    productId: productId,
                    amount: paidAmount,
                    currency: unit || paidCurrency,
                    type: type || 'UNKNOWN',
                    userId: finalUserId
                }, 'API')];
            case 8:
                result = _d.sent();
                return [2 /*return*/, res.json(__assign(__assign({}, result), { isGuest: !finalUserId }))];
            case 9:
                error_5 = _d.sent();
                console.error("Purchase Error:", error_5);
                return [2 /*return*/, res.status(500).json({ error: 'Internal server error' })];
            case 10: return [2 /*return*/];
        }
    });
}); });
// ==================================================================
// STATIC FILES
// ==================================================================
var DIST_PATH = path_1.default.join(process.cwd(), 'dist');
app.use(express_1.default.static(DIST_PATH));
app.get(/(.*)/, function (_req, res) { return res.sendFile(path_1.default.join(DIST_PATH, 'index.html')); });
app.listen(Number(PORT), '0.0.0.0', function () { return console.log("\uD83D\uDE80 API Server running on port ".concat(PORT)); });
