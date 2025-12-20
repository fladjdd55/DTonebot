import express from 'express';
import cors from 'cors';
import path from 'path';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

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
  ? (process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [])
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://127.0.0.1:5173'];

const isValidOrigin = (origin: string): boolean => {
  try {
    const url = new URL(origin);
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return false;
    return allowedOrigins.includes(origin);
  } catch { return false; }
};

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || isValidOrigin(origin)) return callback(null, true);
    console.warn(`🚫 CORS Blocked: ${origin}`);
    callback(new Error('CORS policy: Origin not allowed'));
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

// 8. Serve Static Client
const DIST_PATH = path.join(process.cwd(), 'dist');
app.use(express.static(DIST_PATH));
app.get(/(.*)/, (_req, res) => res.sendFile(path.join(DIST_PATH, 'index.html')));

app.listen(Number(PORT), '0.0.0.0', () => console.log(`🚀 API Server running on port ${PORT}`));
