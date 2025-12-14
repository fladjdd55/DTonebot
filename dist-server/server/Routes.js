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
var zod_1 = require("zod");
// Middleware
var ipWhitelist_1 = require("./middleware/ipWhitelist");
var basicAuth_1 = require("./middleware/basicAuth");
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
console.log("\uD83D\uDD12 CORS Configured. Environment: ".concat(process.env.NODE_ENV));
var apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: { error: "Too many requests, please try again later." }
});
// Stricter rate limit for auth endpoints
var authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10, // Only 10 auth attempts per 15 minutes
    message: { error: "Too many login attempts. Please try again later." }
});
app.use('/api/', apiLimiter);
var processedWebhooks = new Set();
// ==================================================================
// 🧩 UNIFIED PURCHASE LOGIC
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
                        // Already completed - skip
                        if (existing.status === 'COMPLETED') {
                            console.log("[Purchase] \u23ED\uFE0F Already completed: ".concat(paymentId));
                            return [2 /*return*/, __assign(__assign({ success: true }, existing), { dbStatus: 'COMPLETED', alreadyProcessed: true })];
                        }
                        // Already failed/refunded - skip
                        if (existing.status === 'REFUNDED' || existing.status === 'FAILED') {
                            console.log("[Purchase] \u23ED\uFE0F Already failed/refunded: ".concat(paymentId));
                            return [2 /*return*/, __assign(__assign({ success: false }, existing), { dbStatus: existing.status, alreadyProcessed: true })];
                        }
                        // ✅ FIX: If PENDING and someone else is processing, BACK OFF
                        if (existing.status === 'PENDING') {
                            ageMs = Date.now() - new Date(existing.createdAt).getTime();
                            // If record is fresh (< 60s), let the original processor finish
                            if (ageMs < 60000) {
                                console.log("[Purchase] \u23ED\uFE0F Already being processed by ".concat(existing.processedVia, " (").concat(Math.round(ageMs / 1000), "s old), ").concat(source, " backing off"));
                                return [2 /*return*/, { success: true, dbStatus: 'PENDING', alreadyProcessed: true }];
                            }
                            // If record is stale (> 60s), take over
                            console.log("[Purchase] \u26A0\uFE0F Stale PENDING record (".concat(Math.round(ageMs / 1000), "s), ").concat(source, " taking over"));
                        }
                    }
                    if (!!existing) return [3 /*break*/, 8];
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
                    console.log("[Purchase] \uD83D\uDD12 Lock acquired via ".concat(source, ": ").concat(paymentId).concat(userId ? " (User: ".concat(userId, ")") : ' (Guest)'));
                    return [3 /*break*/, 7];
                case 4:
                    err_1 = _a.sent();
                    if (!(err_1.code === 'P2002')) return [3 /*break*/, 6];
                    // Someone else got the lock first - back off
                    console.log("[Purchase] \u23ED\uFE0F Lock conflict for ".concat(paymentId, ", backing off..."));
                    return [4 /*yield*/, db_1.db.transaction.findUnique({ where: { paymentIntentId: paymentId } })];
                case 5:
                    check = _a.sent();
                    return [2 /*return*/, {
                            success: (check === null || check === void 0 ? void 0 : check.status) === 'COMPLETED',
                            dbStatus: check === null || check === void 0 ? void 0 : check.status,
                            alreadyProcessed: true
                        }];
                case 6: throw err_1;
                case 7: return [3 /*break*/, 10];
                case 8: 
                // Update processedVia for tracking (but we already decided to proceed above)
                return [4 /*yield*/, db_1.db.transaction.update({
                        where: { paymentIntentId: paymentId },
                        data: { processedVia: source }
                    })];
                case 9:
                    // Update processedVia for tracking (but we already decided to proceed above)
                    _a.sent();
                    _a.label = 10;
                case 10:
                    // 3. Execute DTOne Purchase
                    console.log("[Purchase] \uD83D\uDE80 Processing via ".concat(source, ": ").concat(paymentId));
                    callbackUrl = process.env.DTONE_CALLBACK_URL
                        ? "".concat(process.env.DTONE_CALLBACK_URL, "/api/hooks/dtone")
                        : undefined;
                    return [4 /*yield*/, dtone_1.dtoneService.purchaseProduct(productId, mobile, amount, currency, type, callbackUrl)];
                case 11:
                    result = _a.sent();
                    if (!(!result.success || !result.data)) return [3 /*break*/, 14];
                    console.error("[Purchase] \u274C DTOne Error: ".concat(result.error));
                    return [4 /*yield*/, payment_1.paymentService.refundPayment(paymentId)];
                case 12:
                    refund = _a.sent();
                    return [4 /*yield*/, db_1.db.transaction.update({
                            where: { paymentIntentId: paymentId },
                            data: {
                                status: refund ? 'REFUNDED' : 'REFUND_FAILED',
                                externalId: "failed_".concat(paymentId)
                            }
                        })];
                case 13:
                    _a.sent();
                    return [2 /*return*/, { success: false, error: result.error, code: result.code, refunded: !!refund }];
                case 14:
                    statusId = result.data.statusId;
                    dbStatus = 'PENDING';
                    if (!(statusId === 7)) return [3 /*break*/, 15];
                    dbStatus = 'COMPLETED';
                    console.log("[Purchase] \u2705 Success! DTOne Ref: ".concat(result.data.externalId));
                    return [3 /*break*/, 18];
                case 15:
                    if (![3, 9].includes(statusId || 0)) return [3 /*break*/, 17];
                    console.warn("[Purchase] \u26A0\uFE0F Declined (Status ".concat(statusId, "). Refunding..."));
                    return [4 /*yield*/, payment_1.paymentService.refundPayment(paymentId)];
                case 16:
                    _a.sent();
                    dbStatus = 'FAILED';
                    return [3 /*break*/, 18];
                case 17:
                    console.log("[Purchase] \u23F3 Submitted (Status ".concat(statusId, "). Awaiting callback."));
                    _a.label = 18;
                case 18: return [4 /*yield*/, db_1.db.transaction.update({
                        where: { paymentIntentId: paymentId },
                        data: {
                            status: dbStatus,
                            externalId: result.data.externalId
                        }
                    })];
                case 19:
                    _a.sent();
                    return [2 /*return*/, __assign(__assign({ success: dbStatus === 'COMPLETED' || dbStatus === 'PENDING' }, result.data), { dbStatus: dbStatus, refunded: dbStatus === 'FAILED' })];
            }
        });
    });
}
// ==================================================================
// 1. STRIPE WEBHOOK (BACKUP) - Must be BEFORE express.json()
// ==================================================================
app.post('/api/hooks/stripe', express_1.default.raw({ type: 'application/json' }), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var sig, webhookSecret, event, paymentIntent, existing, ageMs, error_1;
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
                if (processedWebhooks.has(event.id)) {
                    console.log("[Webhook] \u26A0\uFE0F Duplicate event ".concat(event.id, ", ignoring."));
                    return [2 /*return*/, res.json({ received: true })];
                }
                processedWebhooks.add(event.id);
                setTimeout(function () { return processedWebhooks.delete(event.id); }, 24 * 60 * 60 * 1000);
                _a.label = 1;
            case 1:
                _a.trys.push([1, 5, , 6]);
                if (!(event.type === 'payment_intent.succeeded')) return [3 /*break*/, 4];
                paymentIntent = event.data.object;
                console.log("[Webhook] Payment Succeeded: ".concat(paymentIntent.id));
                return [4 /*yield*/, db_1.db.transaction.findUnique({
                        where: { paymentIntentId: paymentIntent.id }
                    })];
            case 2:
                existing = _a.sent();
                if (existing && ['COMPLETED', 'REFUNDED', 'FAILED'].includes(existing.status)) {
                    console.log("[Webhook] \u23ED\uFE0F Already finalized: ".concat(paymentIntent.id));
                    return [2 /*return*/, res.json({ received: true })];
                }
                if ((existing === null || existing === void 0 ? void 0 : existing.processedVia) === 'API' && existing.status === 'PENDING') {
                    ageMs = Date.now() - new Date(existing.createdAt).getTime();
                    if (ageMs < 30000) {
                        console.log("[Webhook] \u23F3 API processing (".concat(Math.round(ageMs / 1000), "s old), waiting..."));
                        return [2 /*return*/, res.json({ received: true })];
                    }
                    console.log("[Webhook] \u26A0\uFE0F API seems stuck, taking over: ".concat(paymentIntent.id));
                }
                if (!(!existing || existing.status === 'PENDING')) return [3 /*break*/, 4];
                console.log("[Webhook] \uD83D\uDD04 Processing payment: ".concat(paymentIntent.id));
                return [4 /*yield*/, processPurchase({
                        paymentId: paymentIntent.id,
                        mobile: paymentIntent.metadata.mobile,
                        productId: Number(paymentIntent.metadata.productId),
                        amount: paymentIntent.amount / 100,
                        currency: paymentIntent.currency.toUpperCase(),
                        type: paymentIntent.metadata.type || 'UNKNOWN',
                        userId: paymentIntent.metadata.userId || undefined
                    }, 'WEBHOOK')];
            case 3:
                _a.sent();
                _a.label = 4;
            case 4:
                res.json({ received: true });
                return [3 /*break*/, 6];
            case 5:
                error_1 = _a.sent();
                console.error('Webhook handler failed:', error_1);
                res.status(500).send('Webhook handler failed');
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); });
// Now parse JSON for all other routes
app.use(express_1.default.json());
// ==================================================================
// 🚀 CACHE & SCHEDULER
// ==================================================================
var COUNTRY_CACHE = [];
var OPERATOR_CACHE = [];
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
                if (process.env.SYNC_ON_STARTUP === 'true') {
                    console.log('[Server] 📦 SYNC_ON_STARTUP=true. Starting product sync...');
                    (0, sync_products_1.syncProducts)();
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
node_cron_1.default.schedule('0 3 * * *', function () { return __awaiter(void 0, void 0, void 0, function () {
    var c, o, err_2;
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
                err_2 = _a.sent();
                console.error('[Scheduler] ❌ Daily sync failed:', err_2);
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); });
// ==================================================================
// VALIDATION SCHEMAS
// ==================================================================
var purchaseSchema = zod_1.z.object({
    productId: zod_1.z.number().int().positive(),
    mobile: zod_1.z.string().min(7).max(15).regex(/^\+?[0-9]+$/, "Invalid mobile format"),
    amount: zod_1.z.number().positive(),
    unit: zod_1.z.string().length(3).optional(),
    paymentId: zod_1.z.string().startsWith("pi_", "Invalid Payment ID format"),
    type: zod_1.z.string().optional()
});
var registerSchema = zod_1.z.object({
    email: zod_1.z.string().email("Invalid email format"),
    password: zod_1.z.string().min(8, "Password must be at least 8 characters"),
    name: zod_1.z.string().min(1).optional()
});
var loginSchema = zod_1.z.object({
    email: zod_1.z.string().email("Invalid email format"),
    password: zod_1.z.string().min(1, "Password is required")
});
// ==================================================================
// 🔐 AUTHENTICATION ROUTES
// ==================================================================
// Register
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
                if (!result.success) {
                    return [2 /*return*/, res.status(400).json({ error: result.error })];
                }
                return [2 /*return*/, res.status(201).json({
                        message: 'Registration successful',
                        user: result.user,
                        token: result.token
                    })];
            case 2:
                error_2 = _b.sent();
                if (error_2 instanceof zod_1.z.ZodError) {
                    return [2 /*return*/, res.status(400).json({
                            error: 'Validation Error',
                            details: error_2.issues.map(function (e) { return e.message; })
                        })];
                }
                console.error('[Auth] Register error:', error_2);
                return [2 /*return*/, res.status(500).json({ error: 'Registration failed' })];
            case 3: return [2 /*return*/];
        }
    });
}); });
// Login
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
                if (!result.success) {
                    return [2 /*return*/, res.status(401).json({ error: result.error })];
                }
                return [2 /*return*/, res.json({
                        message: 'Login successful',
                        user: result.user,
                        token: result.token
                    })];
            case 2:
                error_3 = _b.sent();
                if (error_3 instanceof zod_1.z.ZodError) {
                    return [2 /*return*/, res.status(400).json({
                            error: 'Validation Error',
                            details: error_3.issues.map(function (e) { return e.message; })
                        })];
                }
                console.error('[Auth] Login error:', error_3);
                return [2 /*return*/, res.status(500).json({ error: 'Login failed' })];
            case 3: return [2 /*return*/];
        }
    });
}); });
// Get Current User (Protected)
app.get('/api/auth/me', auth_1.requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, res.json({ user: req.user })];
    });
}); });
// Update Profile (Protected)
app.put('/api/auth/profile', auth_1.requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, name_2, phone, result, error_4;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                _a = req.body, name_2 = _a.name, phone = _a.phone;
                return [4 /*yield*/, auth_2.authService.updateProfile(req.user.id, { name: name_2, phone: phone })];
            case 1:
                result = _b.sent();
                if (!result.success) {
                    return [2 /*return*/, res.status(400).json({ error: result.error })];
                }
                return [2 /*return*/, res.json({ user: result.user })];
            case 2:
                error_4 = _b.sent();
                console.error('[Auth] Update profile error:', error_4);
                return [2 /*return*/, res.status(500).json({ error: 'Failed to update profile' })];
            case 3: return [2 /*return*/];
        }
    });
}); });
// Change Password (Protected)
app.post('/api/auth/change-password', auth_1.requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, currentPassword, newPassword, result, error_5;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                _a = req.body, currentPassword = _a.currentPassword, newPassword = _a.newPassword;
                if (!currentPassword || !newPassword) {
                    return [2 /*return*/, res.status(400).json({ error: 'Current and new password required' })];
                }
                return [4 /*yield*/, auth_2.authService.changePassword(req.user.id, currentPassword, newPassword)];
            case 1:
                result = _b.sent();
                if (!result.success) {
                    return [2 /*return*/, res.status(400).json({ error: result.error })];
                }
                return [2 /*return*/, res.json({ message: 'Password changed successfully' })];
            case 2:
                error_5 = _b.sent();
                console.error('[Auth] Change password error:', error_5);
                return [2 /*return*/, res.status(500).json({ error: 'Failed to change password' })];
            case 3: return [2 /*return*/];
        }
    });
}); });
// Get User's Transaction History (Protected)
app.get('/api/user/transactions', auth_1.requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var page, limit, skip, _a, transactions, total, error_6;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                page = parseInt(req.query.page) || 1;
                limit = Math.min(parseInt(req.query.limit) || 20, 50);
                skip = (page - 1) * limit;
                return [4 /*yield*/, Promise.all([
                        db_1.db.transaction.findMany({
                            where: { userId: req.user.id },
                            orderBy: { createdAt: 'desc' },
                            skip: skip,
                            take: limit,
                            select: {
                                id: true,
                                mobile: true,
                                amount: true,
                                currency: true,
                                status: true,
                                productType: true,
                                createdAt: true,
                                externalId: true
                            }
                        }),
                        db_1.db.transaction.count({ where: { userId: req.user.id } })
                    ])];
            case 1:
                _a = _b.sent(), transactions = _a[0], total = _a[1];
                return [2 /*return*/, res.json({
                        transactions: transactions,
                        pagination: {
                            page: page,
                            limit: limit,
                            total: total,
                            pages: Math.ceil(total / limit)
                        }
                    })];
            case 2:
                error_6 = _b.sent();
                console.error('[User] Get transactions error:', error_6);
                return [2 /*return*/, res.status(500).json({ error: 'Failed to get transactions' })];
            case 3: return [2 /*return*/];
        }
    });
}); });
// ==================================================================
// PUBLIC API ROUTES
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
    var _a, operatorId, currency_1, ranged, opId, whereClause, localProducts, mapped, result, apiProducts, error_7;
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
                        benefits: [],
                        costPrice: number,
                        costCurrency: string,
                    }); });
                    return [2 /*return*/, res.json(mapped)];
                }
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
                error_7 = _b.sent();
                console.error('Error fetching products:', error_7);
                return [2 /*return*/, res.status(500).json({ error: error_7.message })];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.post('/api/lookup', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var mobile, result, error_8;
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
                error_8 = _a.sent();
                return [2 /*return*/, res.status(500).json({ error: error_8.message })];
            case 4: return [2 /*return*/];
        }
    });
}); });
// ==================================================================
// PAYMENT INTENT (with Price Verification) - Supports Guest + User
// ==================================================================
app.post('/api/create-payment-intent', auth_1.optionalAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, amount, currency, mobile, productId, type, idempotencyKey, priceCheck, result, error_9;
    var _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _a = req.body, amount = _a.amount, currency = _a.currency, mobile = _a.mobile, productId = _a.productId, type = _a.type;
                idempotencyKey = req.headers['idempotency-key'];
                if (!amount || !currency || !productId) {
                    return [2 /*return*/, res.status(400).json({ error: 'Amount, currency, and productId are required' })];
                }
                _d.label = 1;
            case 1:
                _d.trys.push([1, 4, , 5]);
                return [4 /*yield*/, priceVerification_1.priceVerificationService.verifyProductPrice(productId, amount, currency)];
            case 2:
                priceCheck = _d.sent();
                if (!priceCheck.valid && priceCheck.code !== 'CACHE_MISS' && priceCheck.code !== 'NO_PRICE') {
                    console.warn("[Security] \uD83D\uDEA8 Price verification failed: ".concat(priceCheck.error));
                    return [2 /*return*/, res.status(400).json({
                            error: priceCheck.error,
                            code: priceCheck.code,
                            expectedPrice: priceCheck.expectedPrice,
                            expectedCurrency: priceCheck.expectedCurrency
                        })];
                }
                return [4 /*yield*/, payment_1.paymentService.createPaymentIntent(amount, currency, {
                        mobile: mobile,
                        productId: productId,
                        type: type,
                        userId: (_b = req.user) === null || _b === void 0 ? void 0 : _b.id // Include user ID in metadata if logged in
                    }, idempotencyKey)];
            case 3:
                result = _d.sent();
                // Return user status along with payment intent
                res.json(__assign(__assign({}, result), { isGuest: !req.user, userId: (_c = req.user) === null || _c === void 0 ? void 0 : _c.id }));
                return [3 /*break*/, 5];
            case 4:
                error_9 = _d.sent();
                res.status(500).json({ error: error_9.message });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
// ==================================================================
// API PURCHASE (PRIMARY) - Supports Guest + User
// ==================================================================
app.post('/api/purchase', auth_1.optionalAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var cleanData, productId, mobile, amount, unit, paymentId, type, paymentIntent, paidProductId, paidAmount, paidCurrency, priceCheck, userId, result, error_10;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _d.trys.push([0, 4, , 5]);
                cleanData = purchaseSchema.parse(req.body);
                productId = cleanData.productId, mobile = cleanData.mobile, amount = cleanData.amount, unit = cleanData.unit, paymentId = cleanData.paymentId, type = cleanData.type;
                return [4 /*yield*/, stripe.paymentIntents.retrieve(paymentId)];
            case 1:
                paymentIntent = _d.sent();
                if (paymentIntent.status !== 'succeeded') {
                    console.warn("[Security] \uD83D\uDEA8 Unpaid Intent: ".concat(paymentId));
                    return [2 /*return*/, res.status(403).json({ error: 'Payment not completed.' })];
                }
                paidProductId = Number((_a = paymentIntent.metadata) === null || _a === void 0 ? void 0 : _a.productId);
                if (paidProductId && paidProductId !== productId) {
                    console.warn("[Security] \uD83D\uDEA8 Product mismatch: paid=".concat(paidProductId, ", requested=").concat(productId));
                    return [2 /*return*/, res.status(403).json({ error: 'Product mismatch.' })];
                }
                paidAmount = paymentIntent.amount / 100;
                paidCurrency = paymentIntent.currency.toUpperCase();
                return [4 /*yield*/, priceVerification_1.priceVerificationService.verifyProductPrice(productId, paidAmount, paidCurrency)];
            case 2:
                priceCheck = _d.sent();
                if (!priceCheck.valid && priceCheck.code !== 'CACHE_MISS' && priceCheck.code !== 'NO_PRICE') {
                    console.warn("[Security] \uD83D\uDEA8 Purchase price mismatch: paid ".concat(paidAmount, " ").concat(paidCurrency, ", expected ").concat(priceCheck.expectedPrice, " ").concat(priceCheck.expectedCurrency));
                    // Don't block - payment already succeeded, but log it
                    // In production, you might want to flag this for review
                }
                userId = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id) || ((_c = paymentIntent.metadata) === null || _c === void 0 ? void 0 : _c.userId) || undefined;
                return [4 /*yield*/, processPurchase({
                        paymentId: paymentId,
                        mobile: mobile,
                        productId: productId,
                        amount: paidAmount,
                        currency: unit || paidCurrency,
                        type: type || 'UNKNOWN',
                        userId: userId
                    }, 'API')];
            case 3:
                result = _d.sent();
                return [2 /*return*/, res.json(__assign(__assign({}, result), { isGuest: !userId }))];
            case 4:
                error_10 = _d.sent();
                if (error_10 instanceof zod_1.z.ZodError) {
                    return [2 /*return*/, res.status(400).json({
                            error: 'Validation Error',
                            details: error_10.issues.map(function (e) { return e.message; })
                        })];
                }
                console.error("Purchase API Error:", error_10);
                return [2 /*return*/, res.status(500).json({ success: false, error: 'Internal server error' })];
            case 5: return [2 /*return*/];
        }
    });
}); });
// ==================================================================
// TRANSACTION STATUS CHECK
// ==================================================================
app.get('/api/transaction/:paymentId', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var paymentId, txn, error_11;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                paymentId = req.params.paymentId;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, db_1.db.transaction.findUnique({
                        where: { paymentIntentId: paymentId }
                    })];
            case 2:
                txn = _a.sent();
                if (!txn)
                    return [2 /*return*/, res.json({ status: 'PENDING' })];
                return [2 /*return*/, res.json({ status: txn.status, externalId: txn.externalId })];
            case 3:
                error_11 = _a.sent();
                console.error("Status Check Error:", error_11);
                return [2 /*return*/, res.status(500).json({ error: error_11.message })];
            case 4: return [2 /*return*/];
        }
    });
}); });
// ==================================================================
// DTONE WEBHOOK (with IP + Basic Auth)
// ==================================================================
app.post('/api/hooks/dtone', ipWhitelist_1.dtoneIpWhitelist, basicAuth_1.dtoneBasicAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, external_id, status, txn, statusId, error_12;
    var _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _a = req.body, external_id = _a.external_id, status = _a.status;
                if (!external_id) {
                    return [2 /*return*/, res.status(400).send('Missing external_id')];
                }
                console.log("[DTOne Callback] Received: ".concat(external_id, " \u2192 Status: ").concat((_b = status === null || status === void 0 ? void 0 : status.class) === null || _b === void 0 ? void 0 : _b.id));
                _d.label = 1;
            case 1:
                _d.trys.push([1, 8, , 9]);
                return [4 /*yield*/, db_1.db.transaction.findFirst({
                        where: { externalId: external_id }
                    })];
            case 2:
                txn = _d.sent();
                if (!txn) {
                    console.warn("[DTOne Callback] Unknown transaction: ".concat(external_id));
                    return [2 /*return*/, res.status(200).send('OK')];
                }
                statusId = (_c = status === null || status === void 0 ? void 0 : status.class) === null || _c === void 0 ? void 0 : _c.id;
                if (!(statusId === 7)) return [3 /*break*/, 4];
                return [4 /*yield*/, db_1.db.transaction.update({
                        where: { id: txn.id },
                        data: { status: 'COMPLETED' }
                    })];
            case 3:
                _d.sent();
                console.log("[DTOne Callback] \u2705 Transaction ".concat(external_id, " completed"));
                return [3 /*break*/, 7];
            case 4:
                if (![3, 9].includes(statusId)) return [3 /*break*/, 7];
                if (!(txn.paymentIntentId && txn.status !== 'REFUNDED')) return [3 /*break*/, 7];
                return [4 /*yield*/, payment_1.paymentService.refundPayment(txn.paymentIntentId)];
            case 5:
                _d.sent();
                return [4 /*yield*/, db_1.db.transaction.update({
                        where: { id: txn.id },
                        data: { status: 'REFUNDED' }
                    })];
            case 6:
                _d.sent();
                console.log("[DTOne Callback] \uD83D\uDCB8 Transaction ".concat(external_id, " failed \u2192 Refunded"));
                _d.label = 7;
            case 7:
                res.status(200).send('OK');
                return [3 /*break*/, 9];
            case 8:
                error_12 = _d.sent();
                console.error('[DTOne Callback] Error:', error_12);
                res.status(500).send('Internal error');
                return [3 /*break*/, 9];
            case 9: return [2 /*return*/];
        }
    });
}); });
// ==================================================================
// STATIC FILES (Frontend)
// ==================================================================
var DIST_PATH = path_1.default.join(process.cwd(), 'dist');
app.use(express_1.default.static(DIST_PATH));
app.get(/(.*)/, function (_req, res) { return res.sendFile(path_1.default.join(DIST_PATH, 'index.html')); });
app.listen(Number(PORT), '0.0.0.0', function () { return console.log("\uD83D\uDE80 API Server running on port ".concat(PORT)); });
