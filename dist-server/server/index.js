"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./env");
const env_1 = require("./env");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const db_1 = require("./db");
const redis_1 = require("./services/redis");
// Feature Routes
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const catalog_routes_1 = __importDefault(require("./routes/catalog.routes"));
const payment_routes_1 = __importDefault(require("./routes/payment.routes"));
const webhook_routes_1 = __importDefault(require("./routes/webhook.routes"));
// System
const cron_1 = require("./cron");
const logger_1 = require("./lib/logger");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.set('trust proxy', 1);
// 1. Start System Processes
(0, cron_1.startCronJobs)();
app.use(logger_1.requestLogger);
// 2. Security Middleware
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
// 3. CORS
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? env_1.env.ALLOWED_ORIGINS // This is now a validated string[] array
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://127.0.0.1:5173'];
const isValidOrigin = (origin) => {
    try {
        // We can now skip the strict protocol check here because 
        // Zod already validated that env.ALLOWED_ORIGINS contains valid URLs.
        return allowedOrigins.includes(origin);
    }
    catch {
        return false;
    }
};
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin)
            return callback(null, true);
        if (isValidOrigin(origin)) {
            return callback(null, true);
        }
        else {
            console.warn(`🚫 CORS Blocked: ${origin}`);
            return callback(new Error('CORS policy: Origin not allowed'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'stripe-signature', 'idempotency-key'],
    maxAge: 86400
}));
app.use((0, cookie_parser_1.default)());
// 4. Webhooks (Mount BEFORE JSON parsing)
app.use('/api/hooks', webhook_routes_1.default);
// 5. Global API Rate Limiter
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Too many requests" }
});
app.use('/api/', apiLimiter);
// 6. JSON Body Parsing
app.use(express_1.default.json({ limit: '1mb' }));
// 7. Mount Feature Routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api', catalog_routes_1.default); // countries, operators, products
app.use('/api', payment_routes_1.default); // purchase, transactions
// 8. Health check Endpoint 
app.get('/health', async (_req, res) => {
    const status = {
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        services: {
            database: 'unknown',
            redis: 'unknown'
        }
    };
    try {
        // 1. Database Check (with timeout to prevent hanging)
        // We use Promise.race to force a timeout if DB is stuck
        await Promise.race([
            db_1.db.$queryRaw `SELECT 1`,
            new Promise((_, reject) => setTimeout(() => reject(new Error('DB Timeout')), 2000))
        ]);
        status.services.database = 'connected';
        // 2. Redis Check (Using PING instead of EXISTS)
        const redis = (0, redis_1.getRedis)();
        const redisResult = await redis.ping().catch(() => 'failed');
        status.services.redis = redisResult === 'PONG' ? 'connected' : 'disconnected';
        // 3. Overall Decision
        // If DB is critical, we return 503 if it's down. Redis might be optional (fallback).
        if (status.services.database !== 'connected') {
            throw new Error('Database unavailable');
        }
        res.status(200).json({ status: 'healthy', ...status });
    }
    catch (error) {
        console.error('❌ Health Check Failed:', error); // Log real error internally
        res.status(503).json({
            status: 'unhealthy',
            ...status,
            error: 'Service Unavailable' // Generic message for public safety
        });
    }
    const dtoneStatus = await dtoneService.getCountries(1)
        .then(r => r.success ? 'connected' : 'degraded')
        .catch(() => 'disconnected');
    status.services.dtone = dtoneStatus;
});
// Redirect /api/health to /health is excellent for consistency
app.get('/api/health', (req, res) => res.redirect('/health'));
// 9. Serve Static Client
const DIST_PATH = path_1.default.join(process.cwd(), 'dist');
app.use(express_1.default.static(DIST_PATH));
app.get(/(.*)/, (_req, res) => res.sendFile(path_1.default.join(DIST_PATH, 'index.html')));
async function startServer() {
    try {
        // 1. Test Database Connection
        console.log('🗄️  Verifying database connection...');
        await db_1.db.$connect();
        await db_1.db.$queryRaw `SELECT 1`; // Simple query to verify it works
        console.log('✅ Database connected successfully');
        // 2. Start Server
        app.listen(Number(PORT), '0.0.0.0', () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    }
    catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}
// Handle shutdown gracefully
process.on('SIGTERM', async () => {
    console.log('📴 SIGTERM received, shutting down gracefully...');
    await db_1.db.$disconnect();
    process.exit(0);
});
process.on('SIGINT', async () => {
    console.log('📴 SIGINT received, shutting down gracefully...');
    await db_1.db.$disconnect();
    process.exit(0);
});
startServer();
