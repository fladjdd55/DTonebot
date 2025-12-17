import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import Stripe from 'stripe';
import cron from 'node-cron';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { z } from 'zod';

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
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' as any });

const FALLBACK_MARGIN = Number(process.env.DTONE_FALLBACK_MARGIN) || 1.15;
const GLOBAL_MIN_USD = Number(process.env.VITE_MIN_USD_ORDER || 5);

// ==================================================================
// 🚀 PERFORMANCE CACHE
// ==================================================================
let COUNTRY_CACHE: any[] = [];
let OPERATOR_CACHE: any[] = [];
// ✅ OPTIMIZATION: Pre-computed Index for O(1) Lookups
let OPERATOR_INDEX: Record<string, any[]> = {}; 

const rebuildOperatorIndex = (operators: any[]) => {
  const index: Record<string, any[]> = {};
  for (const op of operators) {
    const code = op.countryCode || op.countryIso; 
    if (code) {
      if (!index[code]) index[code] = [];
      index[code].push(op);
    }
  }
  OPERATOR_INDEX = index;
  console.log(`[Cache] Operator Index Rebuilt: Indexed ${Object.keys(index).length} countries.`);
};

const initializeCache = async () => {
  try {
    const c = await syncCountries(); if(c) COUNTRY_CACHE = c;
    const o = await syncOperators(); 
    if(o) {
      OPERATOR_CACHE = o;
      rebuildOperatorIndex(o); // Build index on startup
    }
    if (process.env.SYNC_ON_STARTUP === 'true') await syncProducts(); 
  } catch (e) { console.error("Cache init failed", e); }
};

initializeCache();

cron.schedule('0 3 * * *', async () => {
  console.log('[Scheduler] 🌙 Daily Sync...');
  const [c, o] = await Promise.all([syncCountries(), syncOperators()]);
  
  if (c) COUNTRY_CACHE = c;
  if (o) {
    OPERATOR_CACHE = o;
    rebuildOperatorIndex(o); // Rebuild index daily
  }
  await syncProducts();
});

// ==================================================================
// 🔒 SECURITY CONFIGURATION
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
    callback(new Error(`CORS policy: Origin ${origin} is not allowed`));
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
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Please try again later." }
});

app.use('/api/', apiLimiter);

// Deduplication
const processedWebhooks = new Set<string>();

// ==================================================================
// 🧩 UNIFIED PURCHASE LOGIC
// ==================================================================

async function processPurchase(
  data: {
    paymentId: string;
    mobile: string;
    productId: number;
    amount: number;
    currency: string;
    type: string;
    userId?: string;
  },
  source: 'API' | 'WEBHOOK' = 'API'
): Promise<any> {

  const { paymentId, mobile, productId, amount, currency, type, userId } = data;

  // 1. Check existing
  const existing = await db.transaction.findUnique({
    where: { paymentIntentId: paymentId }
  });

  if (existing) {
    if (existing.status === 'COMPLETED') {
      return { success: true, ...existing, dbStatus: 'COMPLETED', alreadyProcessed: true };
    }
    if (['REFUNDED', 'FAILED'].includes(existing.status)) {
      return { success: false, ...existing, dbStatus: existing.status, alreadyProcessed: true };
    }
    if (existing.status === 'PENDING') {
      const ageMs = Date.now() - new Date(existing.createdAt).getTime();
      if (ageMs < 60000) {
        console.log(`[Purchase] ⏭️ Already processing: ${paymentId}`);
        return { success: true, dbStatus: 'PENDING', alreadyProcessed: true };
      }
    }
  }

  // 2. Lock / Create Transaction
  if (!existing) {
    try {
      await db.transaction.create({
        data: {
          externalId: `pending_${paymentId}`,
          paymentIntentId: paymentId,
          paymentId: paymentId,
          mobile,
          productId,
          amount,
          currency,
          productType: type,
          status: 'PENDING',
          processedVia: source,
          userId: userId || null
        }
      });
      console.log(`[Purchase] 🔒 Lock acquired via ${source}: ${paymentId}`);
    } catch (err: any) {
      if (err.code === 'P2002') {
         const check = await db.transaction.findUnique({ where: { paymentIntentId: paymentId } });
         return { success: check?.status === 'COMPLETED', dbStatus: check?.status, alreadyProcessed: true };
      }
      throw err;
    }
  }

  // 3. Call DTOne API
  const callbackUrl = process.env.DTONE_CALLBACK_URL
    ? `${process.env.DTONE_CALLBACK_URL}/api/hooks/dtone`
    : undefined;

  const result = await dtoneService.purchaseProduct(
    productId, mobile, amount, currency, type, callbackUrl
  );

  // 4. Handle Immediate Failure
  if (!result.success || !result.data) {
    console.error(`[Purchase] ❌ DTOne Error: ${result.error}`);
    const refund = await paymentService.refundPayment(paymentId);
    
    await db.transaction.update({
      where: { paymentIntentId: paymentId },
      data: { status: refund ? 'REFUNDED' : 'REFUND_FAILED', externalId: `failed_${paymentId}` }
    });

    // Audit Log
    try {
        await db.auditLog.create({
        data: {
            action: 'PURCHASE_FAILED',
            userId: userId,
            metadata: { paymentId, error: result.error, refundId: refund?.id }
        }
        });
    } catch (e) { console.error("Audit Log failed", e); }

    return { success: false, error: result.error, code: result.code, refunded: !!refund };
  }

  // 5. Handle Pending/Success
  const statusId = result.data.statusId;
  let dbStatus = 'PENDING';

  if (statusId === 7) {
    dbStatus = 'COMPLETED';
    console.log(`[Purchase] ✅ Success! DTOne Ref: ${result.data.externalId}`);
  } else if ([3, 9].includes(statusId || 0)) {
    console.warn(`[Purchase] ⚠️ Declined (Status ${statusId}). Refunding...`);
    const refund = await paymentService.refundPayment(paymentId);
    dbStatus = 'FAILED';
    
    try {
        await db.auditLog.create({
        data: {
            action: 'PURCHASE_DECLINED',
            userId: userId,
            metadata: { paymentId, statusId, refundId: refund?.id }
        }
        });
    } catch (e) {}
  } else {
    console.log(`[Purchase] ⏳ Submitted (Status ${statusId}). Awaiting callback.`);
  }

  await db.transaction.update({
    where: { paymentIntentId: paymentId },
    data: { status: dbStatus, externalId: result.data.externalId }
  });

  return { success: dbStatus === 'COMPLETED' || dbStatus === 'PENDING', ...result.data, dbStatus, refunded: dbStatus === 'FAILED' };
}

// ==================================================================
// 📡 DTONE WEBHOOK (FIXED: Added Null Check)
// ==================================================================
app.post('/api/hooks/dtone', 
  express.urlencoded({ extended: true }), 
  async (req: Request, res: Response): Promise<any> => {
    try {
      const { transaction_id, status, status_message } = req.body;
      console.log(`[DTOne Webhook] Update for ${transaction_id}: ${status} (${status_message})`);

      if (!transaction_id) return res.status(400).send('Missing transaction_id');

      const txn = await db.transaction.findFirst({
        where: { externalId: transaction_id.toString() }
      });

      if (!txn) return res.status(200).send('OK'); 

      if (['COMPLETED', 'REFUNDED'].includes(txn.status)) {
        return res.status(200).send('Already final');
      }

      const statusId = parseInt(status);
      let newStatus = txn.status;
      let shouldRefund = false;

      if (statusId === 7) newStatus = 'COMPLETED';
      else if ([3, 9].includes(statusId)) {
        newStatus = 'FAILED';
        shouldRefund = true;
      }

      if (newStatus !== txn.status) {
        await db.transaction.update({
          where: { id: txn.id },
          data: { status: newStatus, updatedAt: new Date() }
        });

        // ✅ FIX: Check if paymentIntentId exists before refunding
        if (shouldRefund && txn.paymentIntentId) {
          console.log(`[DTOne Webhook] Refunding ${txn.paymentIntentId}...`);
          const refund = await paymentService.refundPayment(txn.paymentIntentId);
          await db.transaction.update({
             where: { id: txn.id },
             data: { status: refund ? 'REFUNDED' : 'REFUND_FAILED' }
          });
          
          try {
            await db.auditLog.create({
                data: {
                action: 'ASYNC_REFUND',
                userId: txn.userId,
                metadata: { reason: status_message, dtoneId: transaction_id }
                }
            });
          } catch(e) {}
        } else if (shouldRefund && !txn.paymentIntentId) {
           console.warn(`[DTOne Webhook] Cannot refund Txn ${txn.id}: No Payment ID found.`);
        }
      }
      res.status(200).send('OK');
    } catch (error) {
      console.error('[DTOne Webhook] Error:', error);
      res.status(500).send('Error');
    }
  }
);

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

    if (processedWebhooks.has(event.id)) return res.json({ received: true });
    processedWebhooks.add(event.id);
    setTimeout(() => processedWebhooks.delete(event.id), 24 * 60 * 60 * 1000);

    try {
      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await processPurchase({
          paymentId: paymentIntent.id,
          mobile: paymentIntent.metadata.mobile,
          productId: Number(paymentIntent.metadata.productId),
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency.toUpperCase(),
          type: paymentIntent.metadata.type || 'UNKNOWN',
          userId: paymentIntent.metadata.userId || undefined
        }, 'WEBHOOK');
      }
      res.json({ received: true });
    } catch (error) {
      console.error('Webhook handler failed:', error);
      res.status(500).send('Webhook handler failed');
    }
  }
);

app.use(express.json());

// ==================================================================
// 🔐 AUTHENTICATION ROUTES (MISSING APIS RESTORED)
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

app.post('/api/auth/register', authLimiter, async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);
    const result = await authService.register(email, password, name);
    
    if (!result.success) return res.status(400).json({ error: result.error });
    
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    
    return res.status(201).json({ message: 'Success', user: result.user, accessToken: result.accessToken });
  } catch (error: any) {
    return res.status(400).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', authLimiter, async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await authService.login(email, password);
    
    if (!result.success) return res.status(401).json({ error: result.error });
    
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    
    return res.json({ message: 'Success', user: result.user, accessToken: result.accessToken });
  } catch (error: any) {
    return res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/refresh', async (req: Request, res: Response): Promise<any> => {
  const refreshToken = req.cookies.refresh_token;
  if (!refreshToken) return res.sendStatus(401);

  // Simple Device Info extraction
  const deviceInfo = {
    ip: req.ip || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown'
  };

  const result = await authService.refreshToken(refreshToken, deviceInfo);
  
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

app.post('/api/auth/logout', async (req, res) => {
  res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
  res.json({ message: 'Logged out' });
});

app.get('/api/auth/me', requireAuth, async (req: Request, res: Response): Promise<any> => {
  return res.json({ user: req.user });
});

app.put('/api/auth/profile', requireAuth, async (req: Request, res: Response): Promise<any> => {
  const result = await authService.updateProfile(req.user!.id, req.body);
  return result.success ? res.json({ user: result.user }) : res.status(400).json({ error: result.error });
});

app.post('/api/auth/change-password', requireAuth, async (req: Request, res: Response): Promise<any> => {
  const { currentPassword, newPassword } = req.body;
  const result = await authService.changePassword(req.user!.id, currentPassword, newPassword);
  return result.success ? res.json({ message: 'Password changed' }) : res.status(400).json({ error: result.error });
});

app.get('/api/user/transactions', requireAuth, async (req: Request, res: Response): Promise<any> => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = 20;
  const skip = (page - 1) * limit;
  
  const [transactions, total] = await Promise.all([
    db.transaction.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      skip, take: limit
    }),
    db.transaction.count({ where: { userId: req.user!.id } })
  ]);
  
  return res.json({ transactions, pagination: { page, limit, total }, pages: Math.ceil(total / limit) });
});

// ==================================================================
// ⚡ OPTIMIZED PUBLIC API ROUTES
// ==================================================================

app.get('/api/countries', (_req, res) => res.json(COUNTRY_CACHE));

app.get('/api/operators', (req, res) => {
  const { country } = req.query;
  // ✅ OPTIMIZATION: Use O(1) Index instead of .filter()
  if (country) {
    const code = String(country).toUpperCase();
    return res.json(OPERATOR_INDEX[code] || []);
  }
  return res.json(OPERATOR_CACHE);
});

app.get('/api/products', async (req: Request, res: Response): Promise<any> => {
  try {
    const { operatorId, currency, ranged, page, limit } = req.query; 
    
    if (!operatorId) return res.status(400).json({ error: 'Operator ID required' });

    const opId = Number(operatorId);
    const whereClause: any = { operatorId: opId };
    
    if (currency) whereClause.currency = String(currency).toUpperCase();
    if (ranged === 'true') {
      whereClause.OR = [
        { type: { contains: 'RANGE' } },
        { minAmount: { not: null }, maxAmount: { not: null } }
      ];
    }

    // ✅ OPTIMIZATION: Pagination
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 100;
    const skip = (pageNum - 1) * limitNum;

    const localProducts = await db.product.findMany({
      where: whereClause,
      orderBy: { amount: 'asc' },
      take: limitNum,  
      skip: skip       
    });

    if (localProducts.length > 0) return res.json(localProducts);

    console.log(`[Cache Miss] Fetching products for Op ${opId}`);
    const result = await dtoneService.getProductsForOperator(opId, pageNum, limitNum, 'en');
    
    if (!result.success || !result.data) {
      return res.status(400).json({ error: result.error, code: result.code });
    }
    return res.json(result.data);

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/lookup', async (req: Request, res: Response): Promise<any> => {
  const { mobile } = req.body;
  if (!mobile) return res.status(400).json({ error: 'Mobile required' });
  try {
    const result = await dtoneService.lookupMobileNumber(mobile);
    if (!result.success) return res.status(404).json({ error: result.error });
    return res.json(result.data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ==================================================================
// 🔐 SECURE PAYMENT & PURCHASE ROUTES (MISSING APIS RESTORED)
// ==================================================================

app.post('/api/create-payment-intent', optionalAuth, async (req: Request, res: Response): Promise<any> => {
  const { mobile, productId, type, customAmount } = req.body; 
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  if (!productId) return res.status(400).json({ error: 'Product ID required' });

  try {
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(400).json({ error: 'Invalid product' });

    let baseCostUsd = 0;
    const isRanged = product.type.includes('RANGE') || (product.minAmount && product.maxAmount);

    if (isRanged) {
      if (!customAmount) return res.status(400).json({ error: 'Custom amount required' });
      
      const min = product.minAmount || 0;
      const max = product.maxAmount || Infinity;
      if (customAmount < min || customAmount > max) {
         return res.status(400).json({ error: `Amount must be between ${min} and ${max}` });
      }

      const costMin = product.costPriceMin || product.costPrice || 0;
      const unitMin = product.minAmount || 1;
      baseCostUsd = customAmount * (costMin / unitMin);
    } else {
      baseCostUsd = product.costPrice || product.amount || 0;
    }

    const finalCharge = baseCostUsd * FALLBACK_MARGIN;

    if (finalCharge < GLOBAL_MIN_USD) {
       return res.status(400).json({ error: `Minimum order is $${GLOBAL_MIN_USD} USD` });
    }

    const result = await paymentService.createPaymentIntent(
      finalCharge, 
      'USD', 
      { 
        mobile, 
        productId: productId.toString(), 
        type,
        userId: req.user?.id,
        localAmount: isRanged ? customAmount.toString() : (product.amount || 0).toString()
      },
      idempotencyKey 
    );

    res.json({ ...result, isGuest: !req.user, userId: req.user?.id });
    
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const purchaseSchema = z.object({
  productId: z.number().int().positive(), 
  mobile: z.string().min(7).max(15),
  amount: z.number().positive(),
  unit: z.string().length(3).optional(),
  paymentId: z.string().startsWith("pi_"),
  type: z.string().optional()
});

app.post('/api/purchase', optionalAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const { productId, mobile, unit, paymentId, type } = purchaseSchema.parse(req.body);

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
    if (paymentIntent.status !== 'succeeded') {
      return res.status(403).json({ error: 'Payment not completed.' });
    }

    const originalPayerId = paymentIntent.metadata?.userId;
    const currentUser = req.user?.id;
    if (originalPayerId && currentUser && originalPayerId !== currentUser) {
      return res.status(403).json({ error: 'Security Violation: Payment ownership mismatch.' });
    }

    const existingTxn = await db.transaction.findUnique({ where: { paymentIntentId: paymentId } });
    if (existingTxn) {
      return res.json({ success: true, ...existingTxn, dbStatus: existingTxn.status, alreadyProcessed: true });
    }

    const paidAmount = paymentIntent.amount / 100;
    const paidCurrency = paymentIntent.currency.toUpperCase();
    const priceCheck = await priceVerificationService.verifyProductPrice(productId, paidAmount, paidCurrency);

    if (!priceCheck.valid && !['CACHE_MISS', 'NO_PRICE'].includes(priceCheck.code || '')) {
      await paymentService.refundPayment(paymentId);
      return res.status(403).json({ error: 'Price verification failed. Payment refunded.' });
    }

    const result = await processPurchase({
      paymentId,
      mobile,
      productId,
      amount: paidAmount,
      currency: unit || paidCurrency,
      type: type || 'UNKNOWN',
      userId: originalPayerId || undefined
    }, 'API');

    return res.json({ ...result, isGuest: !originalPayerId });

  } catch (error: any) {
    console.error("Purchase Error:", error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/transaction/:paymentId', async (req: Request, res: Response): Promise<any> => {
  const { paymentId } = req.params;
  try {
    const txn = await db.transaction.findUnique({
      where: { paymentIntentId: paymentId }
    });

    if (!txn) return res.json({ status: 'PENDING' });
    return res.json({ status: txn.status, externalId: txn.externalId });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ==================================================================
// STATIC FILES
// ==================================================================
const DIST_PATH = path.join(process.cwd(), 'dist');
app.use(express.static(DIST_PATH));
app.get(/(.*)/, (_req, res) => res.sendFile(path.join(DIST_PATH, 'index.html')));

app.listen(Number(PORT), '0.0.0.0', () => console.log(`🚀 API Server running on port ${PORT}`));
