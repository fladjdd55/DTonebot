"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const stripe_1 = __importDefault(require("stripe"));
const node_cron_1 = __importDefault(require("node-cron"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const redis_1 = require("./services/redis");
// Middleware
const auth_1 = require("./middleware/auth");
// Services
const dtone_1 = require("./dtone");
const sync_countries_1 = require("./scripts/sync-countries");
const sync_operators_1 = require("./scripts/sync-operators");
const sync_products_1 = require("./scripts/sync-products");
const payment_1 = require("./payment");
const auth_2 = require("./auth");
const db_1 = require("./db");
const app = (0, express_1.default)();
const redis = (0, redis_1.getRedis)();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' });
// ✅ FIX: Check multiple env var names to ensure we catch the value
const GLOBAL_MIN_USD = Number(process.env.MIN_USD_ORDER ||
    process.env.VITE_MIN_USD_ORDER ||
    process.env.MIN_ORDER ||
    5);
const FALLBACK_MARGIN = Number(process.env.DTONE_FALLBACK_MARGIN) || 1.15;
// ==================================================================
// 🚀 SCALABLE CACHE (Redis-Based)
// ==================================================================
const CACHE_TTL = 3600;
async function getCachedCountries() {
    const cached = await redis.get('cache:countries');
    if (cached)
        return JSON.parse(cached);
    const fresh = await (0, sync_countries_1.syncCountries)();
    if (fresh)
        await redis.set('cache:countries', JSON.stringify(fresh), CACHE_TTL);
    return fresh || [];
}
async function getCachedOperators() {
    const cached = await redis.get('cache:operators');
    if (cached)
        return JSON.parse(cached);
    const fresh = await (0, sync_operators_1.syncOperators)();
    if (fresh) {
        await redis.set('cache:operators', JSON.stringify(fresh), CACHE_TTL);
        const index = {};
        for (const op of fresh) {
            const code = (op.countryCode || op.countryIso)?.toUpperCase();
            if (code) {
                if (!index[code])
                    index[code] = [];
                index[code].push(op);
            }
        }
        await redis.set('cache:operator_index', JSON.stringify(index), CACHE_TTL);
    }
    return fresh || [];
}
// ✅ HELPER: Calculate Safe Minimum Amount
function getSafeMinAmount(p) {
    let safeMin = p.minAmount || 0;
    // Only check Ranged products
    if (p.type === 'RANGED_VALUE') {
        // 1. Try to use cached cost price from DB
        const baseMinCost = p.costPriceMin || p.costPrice;
        if (baseMinCost && baseMinCost > 0) {
            const costPerUnit = baseMinCost / (p.minAmount || 1);
            // Target: We need (Cost * Margin) >= GLOBAL_MIN_USD
            const targetCostUsd = GLOBAL_MIN_USD / FALLBACK_MARGIN;
            const requiredUnits = targetCostUsd / costPerUnit;
            if (requiredUnits > safeMin) {
                safeMin = Math.ceil(requiredUnits);
            }
        }
        // 2. Fallback: If DB missing cost (Sync didn't run), assume 1-to-1 conversion roughly to prevent huge losses
        else if (p.currency === 'USD') {
            const targetUnits = GLOBAL_MIN_USD / FALLBACK_MARGIN;
            if (targetUnits > safeMin)
                safeMin = Math.ceil(targetUnits);
        }
    }
    return safeMin;
}
// ==================================================================
// 🕒 CRON JOB
// ==================================================================
node_cron_1.default.schedule('0 3 * * *', async () => {
    const lockKey = 'cron:daily_sync:lock';
    const acquired = await redis.set(lockKey, '1', 'EX', 600, 'NX');
    if (!acquired) {
        console.log('[Scheduler] ⏭️ Skipping Daily Sync (Locked by another instance)');
        return;
    }
    console.log('[Scheduler] 🌙 Running Daily Sync...');
    try {
        const [c, o] = await Promise.all([(0, sync_countries_1.syncCountries)(), (0, sync_operators_1.syncOperators)()]);
        if (c)
            await redis.set('cache:countries', JSON.stringify(c), CACHE_TTL);
        if (o) {
            await redis.set('cache:operators', JSON.stringify(o), CACHE_TTL);
            const index = {};
            for (const op of o) {
                const code = (op.countryCode || op.countryIso)?.toUpperCase();
                if (code) {
                    if (!index[code])
                        index[code] = [];
                    index[code].push(op);
                }
            }
            await redis.set('cache:operator_index', JSON.stringify(index), CACHE_TTL);
        }
        await (0, sync_products_1.syncProducts)();
        console.log('[Scheduler] ✅ Daily Sync Completed');
    }
    catch (e) {
        console.error('[Scheduler] ❌ Daily Sync Failed', e);
    }
    finally {
        await redis.del(lockKey);
    }
});
// ==================================================================
// 🔒 SECURITY
// ==================================================================
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
            frameSrc: ["https://js.stripe.com"],
            connectSrc: ["'self'", "https://api.stripe.com", "ws:", "wss:"],
            imgSrc: ["'self'", "data:", "https:", "https://operator-logo.dtone.com"]
        }
    }
}));
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [])
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://127.0.0.1:5173'];
const isValidOrigin = (origin) => {
    try {
        const url = new URL(origin);
        if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')
            return false;
        return allowedOrigins.includes(origin);
    }
    catch {
        return false;
    }
};
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || isValidOrigin(origin))
            return callback(null, true);
        console.warn(`🚫 CORS Blocked: ${origin}`);
        callback(new Error('CORS policy: Origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'stripe-signature', 'idempotency-key'],
    maxAge: 86400
}));
app.use((0, cookie_parser_1.default)());
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Too many requests" }
});
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many login attempts" }
});
app.use('/api/', apiLimiter);
// ==================================================================
// 🧩 UNIFIED PURCHASE LOGIC
// ==================================================================
async function processPurchase(data, source = 'API') {
    const { paymentId, mobile, email, productId, amount, currency, type, userId } = data;
    const lockKey = `lock:purchase:${paymentId}`;
    const isLocked = await redis.set(lockKey, '1', 'EX', 15, 'NX');
    if (!isLocked) {
        return { success: true, dbStatus: client_1.TransactionStatus.PENDING, alreadyProcessed: true };
    }
    try {
        const existing = await db_1.db.transaction.findUnique({
            where: { paymentIntentId: paymentId }
        });
        let mobileToUse = data.mobile;
        if (existing) {
            if (existing.status === client_1.TransactionStatus.INITIALIZED) {
                mobileToUse = existing.mobile;
                await db_1.db.transaction.update({
                    where: { paymentIntentId: paymentId },
                    data: {
                        status: client_1.TransactionStatus.PENDING,
                        externalId: `pending_${paymentId}`,
                        // ✅ FIX: Save who processed this (API or WEBHOOK)
                        processedVia: source
                    }
                });
            }
            else if (existing.status === client_1.TransactionStatus.COMPLETED) {
                return { success: true, ...existing, dbStatus: client_1.TransactionStatus.COMPLETED, alreadyProcessed: true };
            }
            else if (existing.status === client_1.TransactionStatus.FAILED ||
                existing.status === client_1.TransactionStatus.REFUNDED ||
                existing.status === client_1.TransactionStatus.REFUND_FAILED) {
                return { success: false, ...existing, dbStatus: existing.status, alreadyProcessed: true };
            }
            else if (existing.status === client_1.TransactionStatus.PENDING) {
                return { success: true, dbStatus: client_1.TransactionStatus.PENDING, alreadyProcessed: true };
            }
        }
        if (!mobileToUse) {
            console.error(`[Purchase] ❌ FATAL: No mobile number for ${paymentId}`);
            return { success: false, error: "Mobile number missing" };
        }
        if (!existing) {
            try {
                await db_1.db.transaction.create({
                    data: {
                        externalId: `pending_${paymentId}`,
                        paymentIntentId: paymentId,
                        mobile: mobileToUse,
                        email: email || null,
                        productId,
                        amount,
                        currency,
                        productType: type,
                        status: client_1.TransactionStatus.PENDING,
                        processedVia: source, // ✅ FIX: Save source
                        userId: userId || null
                    }
                });
            }
            catch (err) {
                if (err.code === 'P2002') {
                    const check = await db_1.db.transaction.findUnique({ where: { paymentIntentId: paymentId } });
                    return { success: check?.status === client_1.TransactionStatus.COMPLETED, dbStatus: check?.status, alreadyProcessed: true };
                }
                throw err;
            }
        }
        // Determine callback URL based on environment
        const callbackUrl = process.env.DTONE_CALLBACK_URL
            ? `${process.env.DTONE_CALLBACK_URL}/api/hooks/dtone`
            : undefined;
        const result = await dtone_1.dtoneService.purchaseProduct(productId, mobileToUse, amount, currency, type, callbackUrl);
        if (!result.success || !result.data) {
            console.error(`[Purchase] ❌ DTOne Error: ${result.error}`);
            const refund = await payment_1.paymentService.refundPayment(paymentId);
            const failStatus = refund ? client_1.TransactionStatus.REFUNDED : client_1.TransactionStatus.REFUND_FAILED;
            if (!refund)
                console.error(`[CRITICAL] 🚨 Refund failed for payment ${paymentId}`);
            await db_1.db.transaction.update({
                where: { paymentIntentId: paymentId },
                data: { status: failStatus, externalId: `failed_${paymentId}` }
            });
            return { success: false, error: result.error, code: result.code, refunded: !!refund };
        }
        const statusId = result.data.statusId;
        let dbStatus = client_1.TransactionStatus.PENDING;
        if (statusId === 7) {
            dbStatus = client_1.TransactionStatus.COMPLETED;
        }
        else if ([3, 9].includes(statusId || 0)) {
            console.warn(`[Purchase] ⚠️ Declined. Refunding...`);
            const refund = await payment_1.paymentService.refundPayment(paymentId);
            dbStatus = client_1.TransactionStatus.FAILED;
            if (!refund)
                console.error(`[CRITICAL] 🚨 Refund failed for declined payment ${paymentId}`);
        }
        await db_1.db.transaction.update({
            where: { paymentIntentId: paymentId },
            data: { status: dbStatus, externalId: result.data.externalId }
        });
        if (userId) {
            await db_1.db.auditLog.create({
                data: {
                    action: 'PURCHASE',
                    userId: userId,
                    metadata: {
                        paymentId,
                        productId,
                        amount,
                        status: dbStatus
                    }
                }
            }).catch(console.error);
        }
        return {
            success: dbStatus === client_1.TransactionStatus.COMPLETED || dbStatus === client_1.TransactionStatus.PENDING,
            ...result.data,
            dbStatus
        };
    }
    finally {
        await redis.del(lockKey);
    }
}
// ==================================================================
// STRIPE WEBHOOK
// ==================================================================
app.post('/api/hooks/stripe', express_1.default.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret || !sig)
        return res.status(400).send('Webhook Error');
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    }
    catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    const existingEvent = await db_1.db.webhookEvent.findUnique({
        where: { eventId: event.id }
    });
    if (existingEvent)
        return res.json({ received: true });
    await db_1.db.webhookEvent.create({
        data: {
            eventId: event.id,
            eventType: event.type,
            payload: event.data.object,
            processed: false
        }
    });
    try {
        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;
            await processPurchase({
                paymentId: paymentIntent.id,
                mobile: paymentIntent.metadata.mobile,
                email: paymentIntent.receipt_email || undefined,
                productId: Number(paymentIntent.metadata.productId),
                amount: paymentIntent.amount / 100,
                currency: paymentIntent.currency.toUpperCase(),
                type: paymentIntent.metadata.type || 'UNKNOWN',
                userId: paymentIntent.metadata.userId || undefined
            }, 'WEBHOOK');
        }
        await db_1.db.webhookEvent.update({
            where: { eventId: event.id },
            data: { processed: true, processedAt: new Date() }
        });
        res.json({ received: true });
    }
    catch (error) {
        console.error('Webhook handler failed:', error);
        res.status(500).send('Webhook handler failed');
    }
});
// ✅ FIX: ADD DTONE WEBHOOK
// ==================================================================
// DTONE WEBHOOK (Handle async callbacks)
// ==================================================================
app.post('/api/hooks/dtone', express_1.default.json(), async (req, res) => {
    console.log('🪝 [DTOne Webhook] Received:', JSON.stringify(req.body));
    const { external_id, status } = req.body;
    if (!external_id || !status) {
        return res.status(400).send('Invalid payload');
    }
    try {
        const statusId = status.class?.id; // DTOne standard: 7 = Completed, 3/9 = Cancelled/Declined
        let newStatus;
        if (statusId === 7)
            newStatus = client_1.TransactionStatus.COMPLETED;
        else if ([3, 9].includes(statusId))
            newStatus = client_1.TransactionStatus.FAILED;
        if (newStatus) {
            // Update DB
            await db_1.db.transaction.update({
                where: { externalId: external_id },
                data: { status: newStatus }
            });
            console.log(`✅ [DTOne Webhook] Updated ${external_id} to ${newStatus}`);
        }
        return res.status(200).send('OK');
    }
    catch (err) {
        console.error('❌ [DTOne Webhook] Error:', err);
        return res.status(500).send('Error processing webhook');
    }
});
app.use(express_1.default.json({ limit: '1mb' }));
// ==================================================================
// AUTHENTICATION ROUTES
// ==================================================================
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    name: zod_1.z.string().min(1).optional()
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1)
});
const getDeviceInfo = (req) => ({
    ip: req.ip || req.socket.remoteAddress || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown'
});
app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const { email, password, name } = registerSchema.parse(req.body);
        const result = await auth_2.authService.register(email, password, name, getDeviceInfo(req));
        if (!result.success)
            return res.status(400).json({ error: result.error });
        res.cookie('refresh_token', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/api/auth/refresh',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        return res.status(201).json({ user: result.user, accessToken: result.accessToken });
    }
    catch {
        return res.status(400).json({ error: 'Registration failed' });
    }
});
app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = loginSchema.parse(req.body);
        const result = await auth_2.authService.login(email, password, getDeviceInfo(req));
        if (!result.success)
            return res.status(401).json({ error: result.error });
        res.cookie('refresh_token', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/api/auth/refresh',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        return res.json({ user: result.user, accessToken: result.accessToken });
    }
    catch {
        return res.status(500).json({ error: 'Login failed' });
    }
});
app.post('/api/auth/refresh', async (req, res) => {
    const refreshToken = req.cookies.refresh_token;
    if (!refreshToken)
        return res.sendStatus(401);
    const result = await auth_2.authService.refreshToken(refreshToken, getDeviceInfo(req));
    if (!result.success) {
        res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
        return res.status(403).json({ error: 'Session expired' });
    }
    res.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/auth/refresh',
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
    return res.json({ accessToken: result.accessToken });
});
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
    res.json({ message: 'Logged out' });
});
app.get('/api/auth/me', auth_1.requireAuth, (req, res) => res.json({ user: req.user }));
// ==================================================================
// PUBLIC API ROUTES
// ==================================================================
app.get('/api/countries', async (_req, res) => res.json(await getCachedCountries()));
app.get('/api/operators', async (req, res) => {
    const { country } = req.query;
    if (country) {
        const code = String(country).toUpperCase();
        const indexStr = await redis.get('cache:operator_index');
        if (indexStr) {
            const index = JSON.parse(indexStr);
            return res.json(index[code] || []);
        }
    }
    return res.json(await getCachedOperators());
});
app.get('/api/products', async (req, res) => {
    const { operatorId, currency } = req.query;
    if (!operatorId)
        return res.status(400).json({ error: 'Operator ID required' });
    const whereClause = { operatorId: Number(operatorId) };
    if (currency)
        whereClause.currency = String(currency).toUpperCase();
    // 1. Fetch from DB (Include cost fields for calculation, exclude 'benefits' if not in DB)
    const localProducts = await db_1.db.product.findMany({
        where: whereClause,
        orderBy: { amount: 'asc' },
        select: {
            id: true,
            name: true,
            type: true,
            serviceId: true,
            subserviceId: true,
            amount: true,
            currency: true,
            minAmount: true,
            maxAmount: true,
            benefits: true,
            // Select costs to perform the check (we will strip them before returning)
            costPrice: true,
            costPriceMin: true
        }
    });
    if (localProducts.length > 0) {
        const safeProducts = localProducts.map(p => {
            // Calculate safe minimum
            const adjustedMin = getSafeMinAmount(p);
            // Strip sensitive cost data
            const { costPrice, costPriceMin, ...rest } = p;
            return {
                ...rest,
                minAmount: adjustedMin
            };
        });
        return res.json(safeProducts);
    }
    // 2. Fallback: Fetch from API
    const result = await dtone_1.dtoneService.getProductsForOperator(Number(operatorId));
    if (result.success && result.data) {
        const safeProducts = result.data.map(p => {
            // Calculate safe minimum
            const adjustedMin = getSafeMinAmount(p);
            return {
                id: p.id,
                name: p.name,
                type: p.type,
                amount: p.amount,
                currency: p.currency,
                minAmount: adjustedMin, // ✅ Use the adjusted minimum
                maxAmount: p.max,
                benefits: p.benefits,
                isRanged: p.isRanged
                // Costs are implicitly excluded here
            };
        });
        return res.json(safeProducts);
    }
    return res.status(400).json({ error: result.error });
});
app.post('/api/lookup', async (req, res) => {
    const { mobile } = req.body;
    if (!mobile)
        return res.status(400).json({ error: 'Mobile required' });
    const result = await dtone_1.dtoneService.lookupMobileNumber(mobile);
    return result.success ? res.json(result.data) : res.status(404).json({ error: result.error });
});
// ==================================================================
// PURCHASE & TRANSACTION ROUTES
// ==================================================================
app.post('/api/create-payment-intent', auth_1.optionalAuth, async (req, res) => {
    const { mobile, productId, type, customAmount } = req.body;
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey)
        return res.status(400).json({ error: "Idempotency key required" });
    try {
        const product = await db_1.db.product.findUnique({ where: { id: productId } });
        if (!product)
            return res.status(400).json({ error: 'Invalid product' });
        let cost = product.costPrice || product.amount || 0;
        if (product.type.includes('RANGE') && customAmount) {
            const unitCost = (product.costPriceMin || 0) / (product.minAmount || 1);
            cost = customAmount * unitCost;
        }
        const finalCharge = cost * FALLBACK_MARGIN;
        if (finalCharge < GLOBAL_MIN_USD)
            return res.status(400).json({ error: `Min order is $${GLOBAL_MIN_USD}` });
        // Calculate display amount (Face Value)
        const localAmount = (product.type.includes('RANGE') && customAmount)
            ? customAmount
            : (product.amount || 0);
        const result = await payment_1.paymentService.createPaymentIntent(finalCharge, 'USD', {
            productId: Number(productId),
            type,
            userId: req.user?.id,
            localAmount: localAmount.toString()
        }, idempotencyKey);
        await db_1.db.transaction.create({
            data: {
                externalId: `init_${result.id}`,
                paymentIntentId: result.id,
                mobile,
                productId: Number(productId),
                amount: finalCharge,
                currency: 'USD',
                productType: type,
                status: client_1.TransactionStatus.INITIALIZED,
                userId: req.user?.id,
                // ✅ FIX: Mark as started by API
                processedVia: 'API'
            }
        });
        res.json({
            ...result,
            chargeAmount: finalCharge,
            localAmount: localAmount,
            currency: product.currency,
            breakdown: {
                base: cost,
                margin: FALLBACK_MARGIN,
                final: finalCharge
            }
        });
    }
    catch (error) {
        if (error.code === 'P2002')
            return res.status(409).json({ error: "Duplicate request" });
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/purchase', auth_1.optionalAuth, async (req, res) => {
    try {
        const { productId, mobile, paymentId, type } = req.body;
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
        if (paymentIntent.status !== 'succeeded')
            return res.status(403).json({ error: 'Not paid' });
        const result = await processPurchase({
            paymentId,
            mobile,
            email: paymentIntent.receipt_email || undefined,
            productId,
            amount: paymentIntent.amount / 100,
            currency: paymentIntent.currency.toUpperCase(),
            type: type || 'UNKNOWN',
            userId: paymentIntent.metadata.userId || undefined
        }, 'API');
        return res.json(result);
    }
    catch {
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// ✅ FIX: UPDATED SELF-HEALING STATUS CHECK
app.get('/api/transaction/:paymentId', async (req, res) => {
    try {
        const txn = await db_1.db.transaction.findUnique({ where: { paymentIntentId: req.params.paymentId } });
        if (!txn)
            return res.status(404).json({ error: "Transaction not found" });
        // ✅ SELF-HEALING: If stuck in PENDING, ask DTOne for an update
        if (txn.status === client_1.TransactionStatus.PENDING && txn.externalId.startsWith('txn_')) {
            const check = await dtone_1.dtoneService.getTransaction(txn.externalId);
            if (check.success && check.data) {
                // Explicitly type to avoid TS errors
                let newStatus = txn.status;
                const sid = check.data.statusId;
                if (sid === 7)
                    newStatus = client_1.TransactionStatus.COMPLETED;
                else if ([3, 9].includes(sid))
                    newStatus = client_1.TransactionStatus.FAILED;
                if (newStatus !== txn.status) {
                    await db_1.db.transaction.update({
                        where: { id: txn.id },
                        data: { status: newStatus }
                    });
                    return res.json({ status: newStatus, externalId: txn.externalId });
                }
            }
        }
        return res.json({ status: txn.status, externalId: txn.externalId });
    }
    catch (error) {
        console.error("Status Check Error:", error);
        return res.status(500).json({ error: "Failed to check status" });
    }
});
app.get('/api/user/transactions', auth_1.requireAuth, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const [transactions, total] = await Promise.all([
        db_1.db.transaction.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit
        }),
        db_1.db.transaction.count({ where: { userId: req.user.id } })
    ]);
    return res.json({ transactions, pagination: { page, limit, total } });
});
// STATIC FILES
const DIST_PATH = path_1.default.join(process.cwd(), 'dist');
app.use(express_1.default.static(DIST_PATH));
app.get(/(.*)/, (_req, res) => res.sendFile(path_1.default.join(DIST_PATH, 'index.html')));
app.listen(Number(PORT), '0.0.0.0', () => console.log(`🚀 API Server running on port ${PORT}`));
