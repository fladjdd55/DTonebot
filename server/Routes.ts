//
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import Stripe from 'stripe';
import cron from 'node-cron';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { TransactionStatus } from '@prisma/client';
import { getRedis } from './services/redis';

// Middleware
import { requireAuth, optionalAuth } from './middleware/auth';

// Services
import { dtoneService } from './dtone';
import { syncCountries } from './scripts/sync-countries';
import { syncOperators } from './scripts/sync-operators';
import { syncProducts } from './scripts/sync-products';
import { paymentService } from './payment';
import { authService } from './auth';
import { priceVerificationService } from './priceVerification';
import { db } from './db';

const app = express();
const redis = getRedis();

app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' as any });

const FALLBACK_MARGIN = Number(process.env.DTONE_FALLBACK_MARGIN) || 1.15;
const GLOBAL_MIN_USD = Number(process.env.VITE_MIN_USD_ORDER || 5);

// ==================================================================
// 🚀 SCALABLE CACHE (Redis-Based)
// ==================================================================
const CACHE_TTL = 3600;

async function getCachedCountries() {
  const cached = await redis.get('cache:countries');
  if (cached) return JSON.parse(cached);
  
  const fresh = await syncCountries();
  if (fresh) await redis.set('cache:countries', JSON.stringify(fresh), CACHE_TTL);
  return fresh || [];
}

async function getCachedOperators() {
  const cached = await redis.get('cache:operators');
  if (cached) return JSON.parse(cached);
  
  const fresh = await syncOperators();
  if (fresh) {
    await redis.set('cache:operators', JSON.stringify(fresh), CACHE_TTL);
    const index: Record<string, any[]> = {};
    for (const op of fresh) {
      const code = (op.countryCode || op.countryIso)?.toUpperCase();
      if (code) {
        if (!index[code]) index[code] = [];
        index[code].push(op);
      }
    }
    await redis.set('cache:operator_index', JSON.stringify(index), CACHE_TTL);
  }
  return fresh || [];
}

// ✅ HELPER: Calculate Safe Minimum Amount
// This ensures the local 'minAmount' is high enough to meet the $5.00 USD limit
function getSafeMinAmount(p: any): number {
  let safeMin = p.minAmount;

  // Only check Ranged products that have valid cost data
  if (p.type === 'RANGED_VALUE' && p.minAmount && (p.costPriceMin || p.costPrice)) {
    const baseMinCost = p.costPriceMin || p.costPrice;

    // Avoid division by zero
    if (baseMinCost > 0) {
      const costPerUnit = baseMinCost / p.minAmount;

      // Formula: We need (Cost * Margin) >= GLOBAL_MIN_USD
      // Therefore: Cost >= (GLOBAL_MIN_USD / Margin)
      // Units * CostPerUnit >= TargetCost
      // Units >= TargetCost / CostPerUnit
      const targetCostUsd = GLOBAL_MIN_USD / FALLBACK_MARGIN;
      const requiredUnits = targetCostUsd / costPerUnit;

      // If the required units to reach $5 are higher than operator's min, use ours
      if (requiredUnits > p.minAmount) {
        safeMin = Math.ceil(requiredUnits); // Round up to next whole number
      }
    }
  }
  return safeMin;
}

// ==================================================================
// 🕒 CRON JOB
// ==================================================================
cron.schedule('0 3 * * *', async () => {
  const lockKey = 'cron:daily_sync:lock';
  const acquired = await redis.set(lockKey, '1', 'EX', 600, 'NX');
  
  if (!acquired) {
    console.log('[Scheduler] ⏭️ Skipping Daily Sync (Locked by another instance)');
    return;
  }

  console.log('[Scheduler] 🌙 Running Daily Sync...');
  try {
    const [c, o] = await Promise.all([syncCountries(), syncOperators()]);
    if (c) await redis.set('cache:countries', JSON.stringify(c), CACHE_TTL);
    if (o) {
      await redis.set('cache:operators', JSON.stringify(o), CACHE_TTL);
      const index: Record<string, any[]> = {};
      for (const op of o) {
        const code = (op.countryCode || op.countryIso)?.toUpperCase();
        if (code) {
          if (!index[code]) index[code] = [];
          index[code].push(op);
        }
      }
      await redis.set('cache:operator_index', JSON.stringify(index), CACHE_TTL);
    }
    await syncProducts();
    console.log('[Scheduler] ✅ Daily Sync Completed');
  } catch (e) {
    console.error('[Scheduler] ❌ Daily Sync Failed', e);
  } finally {
    await redis.del(lockKey);
  }
});

// ==================================================================
// 🔒 SECURITY
// ==================================================================
app.use(helmet({
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

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests" }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts" }
});

app.use('/api/', apiLimiter);

// ==================================================================
// 🧩 UNIFIED PURCHASE LOGIC
// ==================================================================
async function processPurchase(
  data: {
    paymentId: string;
    mobile?: string;
    email?: string;
    productId: number;
    amount: number;
    currency: string;
    type: string;
    userId?: string;
  },
  source: 'API' | 'WEBHOOK' = 'API'
): Promise<any> {

  const { paymentId, mobile, email, productId, amount, currency, type, userId } = data;
  const lockKey = `lock:purchase:${paymentId}`;

  const isLocked = await redis.set(lockKey, '1', 'EX', 15, 'NX');
  if (!isLocked) {
    return { success: true, dbStatus: TransactionStatus.PENDING, alreadyProcessed: true };
  }

  try {
    const existing = await db.transaction.findUnique({
      where: { paymentIntentId: paymentId }
    });

    let mobileToUse = data.mobile;

    if (existing) {
      if (existing.status === TransactionStatus.INITIALIZED) {
         mobileToUse = existing.mobile;
         await db.transaction.update({
            where: { paymentIntentId: paymentId },
            data: { status: TransactionStatus.PENDING, externalId: `pending_${paymentId}` }
         });
      }
      else if (existing.status === TransactionStatus.COMPLETED) {
        return { success: true, ...existing, dbStatus: TransactionStatus.COMPLETED, alreadyProcessed: true };
      }
      else if (
        existing.status === TransactionStatus.FAILED || 
        existing.status === TransactionStatus.REFUNDED || 
        existing.status === TransactionStatus.REFUND_FAILED
      ) {
        return { success: false, ...existing, dbStatus: existing.status, alreadyProcessed: true };
      }
      else if (existing.status === TransactionStatus.PENDING) {
        return { success: true, dbStatus: TransactionStatus.PENDING, alreadyProcessed: true };
      }
    }
    
    if (!mobileToUse) {
      console.error(`[Purchase] ❌ FATAL: No mobile number for ${paymentId}`);
      return { success: false, error: "Mobile number missing" };
    }

    if (!existing) {
      try {
        await db.transaction.create({
          data: {
            externalId: `pending_${paymentId}`,
            paymentIntentId: paymentId,
            mobile: mobileToUse,
            email: email || null,
            productId,
            amount,
            currency,
            productType: type,
            status: TransactionStatus.PENDING,
            processedVia: source,
            userId: userId || null


          }
        });
      } catch (err: any) {
        if (err.code === 'P2002') {
           const check = await db.transaction.findUnique({ where: { paymentIntentId: paymentId } });
           return { success: check?.status === TransactionStatus.COMPLETED, dbStatus: check?.status, alreadyProcessed: true };
        }
        throw err;
      }
    }

    const callbackUrl = process.env.DTONE_CALLBACK_URL
      ? `${process.env.DTONE_CALLBACK_URL}/api/hooks/dtone`
      : undefined;

    const result = await dtoneService.purchaseProduct(
      productId, mobileToUse, amount, currency, type, callbackUrl
    );

    if (!result.success || !result.data) {
      console.error(`[Purchase] ❌ DTOne Error: ${result.error}`);
      const refund = await paymentService.refundPayment(paymentId);
      
      const failStatus = refund ? TransactionStatus.REFUNDED : TransactionStatus.REFUND_FAILED;
      if (!refund) console.error(`[CRITICAL] 🚨 Refund failed for payment ${paymentId}`);

      await db.transaction.update({
        where: { paymentIntentId: paymentId },
        data: { status: failStatus, externalId: `failed_${paymentId}` }
      });

      return { success: false, error: result.error, code: result.code, refunded: !!refund };
    }

    const statusId = result.data.statusId;
    let dbStatus: TransactionStatus = TransactionStatus.PENDING;

    if (statusId === 7) {
      dbStatus = TransactionStatus.COMPLETED;
    } else if ([3, 9].includes(statusId || 0)) {
      console.warn(`[Purchase] ⚠️ Declined. Refunding...`);
      const refund = await paymentService.refundPayment(paymentId);
      dbStatus = TransactionStatus.FAILED;
      if (!refund) console.error(`[CRITICAL] 🚨 Refund failed for declined payment ${paymentId}`);
    }

    await db.transaction.update({
      where: { paymentIntentId: paymentId },
      data: { status: dbStatus, externalId: result.data.externalId }
    });

    if (userId) {
      await db.auditLog.create({
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
      }).catch(console.error); // Don't fail transaction if log fails
    }

    return { 
      success: dbStatus === TransactionStatus.COMPLETED || dbStatus === TransactionStatus.PENDING, 
      ...result.data, 
      dbStatus 
    };

  } finally {
    await redis.del(lockKey);
  }
}

// ==================================================================
// STRIPE WEBHOOK
// ==================================================================
app.post('/api/hooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response): Promise<any> => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret || !sig) return res.status(400).send('Webhook Error');

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const existingEvent = await db.webhookEvent.findUnique({
      where: { eventId: event.id }
    });

    if (existingEvent) return res.json({ received: true });

    await db.webhookEvent.create({
      data: {
        eventId: event.id,
        eventType: event.type,
        payload: event.data.object as any,
        processed: false
      }
    });

    try {
      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        
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

      await db.webhookEvent.update({
        where: { eventId: event.id },
        data: { processed: true, processedAt: new Date() }
      });

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook handler failed:', error);
      res.status(500).send('Webhook handler failed');
    }
  }
);

app.use(express.json({ limit: '1mb' }));

// ==================================================================
// AUTHENTICATION ROUTES
// ==================================================================
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const getDeviceInfo = (req: Request) => ({
  ip: req.ip || req.socket.remoteAddress || 'unknown',
  userAgent: req.headers['user-agent'] || 'unknown'
});

app.post('/api/auth/register', authLimiter, async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);
    const result = await authService.register(email, password, name, getDeviceInfo(req));
    
    if (!result.success) return res.status(400).json({ error: result.error });

    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    
    return res.status(201).json({ user: result.user, accessToken: result.accessToken });
  } catch {
    return res.status(400).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', authLimiter, async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await authService.login(email, password, getDeviceInfo(req));
    
    if (!result.success) return res.status(401).json({ error: result.error });
    
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    
    return res.json({ user: result.user, accessToken: result.accessToken });
  } catch {
    return res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/refresh', async (req: Request, res: Response): Promise<any> => {
  const refreshToken = req.cookies.refresh_token;
  if (!refreshToken) return res.sendStatus(401);

  const result = await authService.refreshToken(refreshToken, getDeviceInfo(req));
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

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

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

app.get('/api/products', async (req: Request, res: Response): Promise<any> => {
  const { operatorId, currency } = req.query;
  if (!operatorId) return res.status(400).json({ error: 'Operator ID required' });

  const whereClause: any = { operatorId: Number(operatorId) };
  if (currency) whereClause.currency = String(currency).toUpperCase();

  // 1. Fetch from DB (Include cost fields for calculation, exclude 'benefits' if not in DB)
  const localProducts = await db.product.findMany({
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
  const result = await dtoneService.getProductsForOperator(Number(operatorId));

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
    }});
    return res.json(safeProducts);
  }

  return res.status(400).json({ error: result.error });
});

app.post('/api/lookup', async (req, res) => {
  const { mobile } = req.body;
  if (!mobile) return res.status(400).json({ error: 'Mobile required' });
  const result = await dtoneService.lookupMobileNumber(mobile);
  return result.success ? res.json(result.data) : res.status(404).json({ error: result.error });
});

// ==================================================================
// PURCHASE & TRANSACTION ROUTES
// ==================================================================
app.post('/api/create-payment-intent', optionalAuth, async (req: Request, res: Response): Promise<any> => {
  const { mobile, productId, type, customAmount } = req.body;
  const idempotencyKey = req.headers['idempotency-key'] as string;
  
  if (!idempotencyKey) return res.status(400).json({ error: "Idempotency key required" });

  try {
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(400).json({ error: 'Invalid product' });

    let cost = product.costPrice || product.amount || 0;
    if (product.type.includes('RANGE') && customAmount) {
      const unitCost = (product.costPriceMin || 0) / (product.minAmount || 1);
      cost = customAmount * unitCost;
    }

    const finalCharge = cost * FALLBACK_MARGIN;
    if (finalCharge < GLOBAL_MIN_USD) return res.status(400).json({ error: `Min order is $${GLOBAL_MIN_USD}` });

    // Calculate display amount (Face Value)
    const localAmount = (product.type.includes('RANGE') && customAmount)
      ? customAmount
      : (product.amount || 0);

    const result = await paymentService.createPaymentIntent(finalCharge, 'USD', {
      productId: Number(productId),
      type,
      userId: req.user?.id,
      localAmount: localAmount.toString()
    }, idempotencyKey);

    await db.transaction.create({
      data: {
        externalId: `init_${result.id}`,
        paymentIntentId: result.id,
        mobile,
        productId: Number(productId),
        amount: finalCharge,
        currency: 'USD',
        productType: type,
        status: TransactionStatus.INITIALIZED,
        userId: req.user?.id
      }
    });

    // ✅ FIXED: Return localAmount, currency, and breakdown
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
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: "Duplicate request" });
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/purchase', optionalAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const { productId, mobile, paymentId, type } = req.body;
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
    
    if (paymentIntent.status !== 'succeeded') return res.status(403).json({ error: 'Not paid' });

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
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/transaction/:paymentId', async (req, res) => {
  const txn = await db.transaction.findUnique({ where: { paymentIntentId: req.params.paymentId } });
  return res.json({ status: txn?.status || TransactionStatus.PENDING, externalId: txn?.externalId });
});

app.get('/api/user/transactions', requireAuth, async (req: Request, res: Response): Promise<any> => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = 20;
  const [transactions, total] = await Promise.all([
    db.transaction.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    db.transaction.count({ where: { userId: req.user!.id } })
  ]);
  return res.json({ transactions, pagination: { page, limit, total } });
});

// STATIC FILES
const DIST_PATH = path.join(process.cwd(), 'dist');
app.use(express.static(DIST_PATH));
app.get(/(.*)/, (_req, res) => res.sendFile(path.join(DIST_PATH, 'index.html')));

app.listen(Number(PORT), '0.0.0.0', () => console.log(`🚀 API Server running on port ${PORT}`));
