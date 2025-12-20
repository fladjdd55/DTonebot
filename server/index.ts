import './env';
import { env } from './env';
import express from 'express';
import cors from 'cors';
import path from 'path';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { db } from './db';
import { getRedis } from './services/redis';

// Feature Routes
import authRoutes from './routes/auth.routes';
import catalogRoutes from './routes/catalog.routes';
import paymentRoutes from './routes/payment.routes';
import webhookRoutes from './routes/webhook.routes';

// System
import { startCronJobs } from './cron';

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

// 1. Start System Processes
startCronJobs();

// 2. Security Middleware
app.use(helmet({
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
  ? env.ALLOWED_ORIGINS // This is now a validated string[] array
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://127.0.0.1:5173'];

const isValidOrigin = (origin: string): boolean => {
  try {
    // We can now skip the strict protocol check here because 
    // Zod already validated that env.ALLOWED_ORIGINS contains valid URLs.
    return allowedOrigins.includes(origin);
  } catch { return false; }
};

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (isValidOrigin(origin)) {
      return callback(null, true);
    } else {
      console.warn(`🚫 CORS Blocked: ${origin}`);
      return callback(new Error('CORS policy: Origin not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'stripe-signature', 'idempotency-key'],
  maxAge: 86400
}));

app.use(cookieParser());

// 4. Webhooks (Mount BEFORE JSON parsing)
app.use('/api/hooks', webhookRoutes);

// 5. Global API Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests" }
});
app.use('/api/', apiLimiter);

// 6. JSON Body Parsing
app.use(express.json({ limit: '1mb' }));

// 7. Mount Feature Routes
app.use('/api/auth', authRoutes);
app.use('/api', catalogRoutes); // countries, operators, products
app.use('/api', paymentRoutes); // purchase, transactions

// 8. Health check Endpoint 
app.get('/health', async (_req, res) => { // Use _req to ignore unused param warning
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
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB Timeout')), 2000))
    ]);
    status.services.database = 'connected';

    // 2. Redis Check (Using PING instead of EXISTS)
    const redis = getRedis();
    const redisResult = await redis.ping().catch(() => 'failed');
    status.services.redis = redisResult === 'PONG' ? 'connected' : 'disconnected';

    // 3. Overall Decision
    // If DB is critical, we return 503 if it's down. Redis might be optional (fallback).
    if (status.services.database !== 'connected') {
      throw new Error('Database unavailable');
    }

    res.status(200).json({ status: 'healthy', ...status });

  } catch (error) {
    console.error('❌ Health Check Failed:', error); // Log real error internally
    res.status(503).json({
      status: 'unhealthy',
      ...status,
      error: 'Service Unavailable' // Generic message for public safety
    });
  }
});

// Redirect /api/health to /health is excellent for consistency
app.get('/api/health', (req, res) => res.redirect('/health'));

// 9. Serve Static Client
const DIST_PATH = path.join(process.cwd(), 'dist');
app.use(express.static(DIST_PATH));
app.get(/(.*)/, (_req, res) => res.sendFile(path.join(DIST_PATH, 'index.html')));

async function startServer() {
  try {
    // 1. Test Database Connection
    console.log('🗄️  Verifying database connection...');
    await db.$connect();
    await db.$queryRaw`SELECT 1`; // Simple query to verify it works
    console.log('✅ Database connected successfully');

    // 2. Start Server
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error: any) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  console.log('📴 SIGTERM received, shutting down gracefully...');
  await db.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📴 SIGINT received, shutting down gracefully...');
  await db.$disconnect();
  process.exit(0);
});

startServer();
