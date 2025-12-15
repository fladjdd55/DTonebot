// server/Routes.ts

import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path'; 
import Stripe from 'stripe'; 
import cron from 'node-cron';
import rateLimit from 'express-rate-limit'; 
import helmet from 'helmet'; 
import cookieParser from 'cookie-parser'; // ✅ NEW: Cookie Parser
import { z } from 'zod';

// Middleware
import { dtoneIpWhitelist } from './middleware/ipWhitelist';
import { dtoneBasicAuth } from './middleware/basicAuth';
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

// Trust Proxy
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' as any });

// ✅ CONFIG: Global Profit Margin (1.15 = 15%)
const FALLBACK_MARGIN = Number(process.env.DTONE_FALLBACK_MARGIN) || 1.15;
const GLOBAL_MIN_USD = Number(process.env.VITE_MIN_USD_ORDER || 5);

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
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      return false;
    }
    return allowedOrigins.includes(origin);
  } catch (error) {
    return false;
  }
};

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (isValidOrigin(origin)) return callback(null, true);
    console.warn(`🚫 CORS Blocked: ${origin}`);
    callback(new Error(`CORS policy: Origin ${origin} is not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'stripe-signature', 'idempotency-key'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400 
}));

// ✅ NEW: Enable Cookie Parser (Must be before routes)
app.use(cookieParser());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100,
  standardHeaders: true, 
  legacyHeaders: false, 
  validate: { xForwardedForHeader: false }, 
  message: { error: "Too many requests, please try again later." }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Please try again later." }
});

app.use('/api/', apiLimiter); 

const processedWebhooks = new Set<string>();

// ==================================================================
// 🧩 UNIFIED PURCHASE LOGIC (WITH SECURITY FIXES)
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

  const existing = await db.transaction.findUnique({
    where: { paymentIntentId: paymentId }
  });

  if (existing) {
    if (existing.status === 'COMPLETED') {
      console.log(`[Purchase] ⏭️ Already completed: ${paymentId}`);
      return { success: true, ...existing, dbStatus: 'COMPLETED', alreadyProcessed: true };
    }
    if (existing.status === 'REFUNDED' || existing.status === 'FAILED') {
      console.log(`[Purchase] ⏭️ Already failed/refunded: ${paymentId}`);
      return { success: false, ...existing, dbStatus: existing.status, alreadyProcessed: true };
    }
    if (existing.status === 'PENDING') {
      const ageMs = Date.now() - new Date(existing.createdAt).getTime();
      if (ageMs < 60000) {
        console.log(`[Purchase] ⏭️ Already being processed (${Math.round(ageMs/1000)}s old), backing off`);
        return { success: true, dbStatus: 'PENDING', alreadyProcessed: true };
      }
    }
  }

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

  const callbackUrl = process.env.DTONE_CALLBACK_URL
    ? `${process.env.DTONE_CALLBACK_URL}/api/hooks/dtone`
    : undefined;

  const result = await dtoneService.purchaseProduct(
    productId, mobile, amount, currency, type, callbackUrl
  );

  if (!result.success || !result.data) {
    console.error(`[Purchase] ❌ DTOne Error: ${result.error}`);
    const refund = await paymentService.refundPayment(paymentId);
    await db.transaction.update({
      where: { paymentIntentId: paymentId },
      data: { status: refund ? 'REFUNDED' : 'REFUND_FAILED', externalId: `failed_${paymentId}` }
    });
    return { success: false, error: result.error, code: result.code, refunded: !!refund };
  }

  const statusId = result.data.statusId;
  let dbStatus = 'PENDING';

  if (statusId === 7) {
    dbStatus = 'COMPLETED';
    console.log(`[Purchase] ✅ Success! DTOne Ref: ${result.data.externalId}`);
  } else if ([3, 9].includes(statusId || 0)) {
    console.warn(`[Purchase] ⚠️ Declined (Status ${statusId}). Refunding...`);
    await paymentService.refundPayment(paymentId);
    dbStatus = 'FAILED';
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
// CACHE & SCHEDULER
// ==================================================================
let COUNTRY_CACHE: any[] = [];
let OPERATOR_CACHE: any[] = []; 

const initializeCache = async () => {
  try {
    const c = await syncCountries(); if(c) COUNTRY_CACHE = c;
    const o = await syncOperators(); if(o) OPERATOR_CACHE = o;
    if (process.env.SYNC_ON_STARTUP === 'true') await syncProducts(); 
  } catch (e) { console.error("Cache init failed", e); }
};

initializeCache();

cron.schedule('0 3 * * *', async () => {
  console.log('[Scheduler] 🌙 Daily Sync...');
  await Promise.all([syncCountries(), syncOperators(), syncProducts()]);
});

// ==================================================================
// VALIDATION SCHEMAS
// ==================================================================
const purchaseSchema = z.object({
  productId: z.number().int().positive(), 
  mobile: z.string().min(7).max(15),
  amount: z.number().positive(), // This is the paid amount from client (for verification only)
  unit: z.string().length(3).optional(),
  paymentId: z.string().startsWith("pi_"),
  type: z.string().optional()
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

// ==================================================================
// 🔐 AUTHENTICATION ROUTES (COOKIE BASED)
// ==================================================================

app.post('/api/auth/register', authLimiter, async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);
    const result = await authService.register(email, password, name);
    
    if (!result.success) return res.status(400).json({ error: result.error });
    
    // ✅ Secure HTTP-Only Cookie
    res.cookie('auth_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    return res.status(201).json({ message: 'Registration successful', user: result.user });
  } catch (error: any) {
    return res.status(400).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', authLimiter, async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await authService.login(email, password);
    
    if (!result.success) return res.status(401).json({ error: result.error });
    
    // ✅ Secure HTTP-Only Cookie
    res.cookie('auth_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    
    return res.json({ message: 'Login successful', user: result.user });
  } catch (error: any) {
    return res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ message: 'Logged out successfully' });
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
  
  return res.json({ transactions, pagination: { page, limit, total } });
});

// ==================================================================
// PUBLIC API ROUTES
// ==================================================================
app.get('/api/countries', (_req, res) => res.json(COUNTRY_CACHE));
app.get('/api/operators', (req, res) => {
  const { country } = req.query;
  res.json(country ? OPERATOR_CACHE.filter(op => op.countryCode === String(country).toUpperCase()) : OPERATOR_CACHE);
});
app.get('/api/products', async (req, res) => { /* (Keep your existing products logic here) */ });
app.post('/api/lookup', async (req, res) => { /* (Keep your existing lookup logic here) */ });

// ==================================================================
// 🔐 SECURE PAYMENT INTENT (SERVER-SIDE PRICE CALCULATION)
// ==================================================================
app.post('/api/create-payment-intent', optionalAuth, async (req: Request, res: Response): Promise<any> => {
  // ❌ IGNORING 'amount' from client. Using 'customAmount' for Ranged only.
  const { currency, mobile, productId, type, customAmount } = req.body; 
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  if (!productId) return res.status(400).json({ error: 'Product ID required' });

  try {
    // 1. Fetch Product from Trusted DB
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(400).json({ error: 'Invalid product' });

    // 2. Calculate Base Cost (USD)
    let baseCostUsd = 0;
    const isRanged = product.type.includes('RANGE') || (product.minAmount && product.maxAmount);

    if (isRanged) {
      if (!customAmount) return res.status(400).json({ error: 'Custom amount required' });
      
      const min = product.minAmount || 0;
      const max = product.maxAmount || Infinity;
      if (customAmount < min || customAmount > max) {
         return res.status(400).json({ error: `Amount must be between ${min} and ${max}` });
      }

      // Calculate Proportional Cost: (BaseCost / BaseUnit) * Request
      const costMin = product.costPriceMin || product.costPrice || 0;
      const unitMin = product.minAmount || 1;
      baseCostUsd = customAmount * (costMin / unitMin);
    } else {
      // Fixed Product
      baseCostUsd = product.costPrice || product.amount || 0;
    }

    // 3. Apply Profit Margin (15%) + Minimum Order Check
    const finalCharge = baseCostUsd * FALLBACK_MARGIN;

    if (finalCharge < GLOBAL_MIN_USD) {
       return res.status(400).json({ error: `Minimum order is $${GLOBAL_MIN_USD} USD` });
    }

    // 4. Create Intent
    const result = await paymentService.createPaymentIntent(
      finalCharge, 
      'USD', // Force USD
      { 
        mobile, 
        productId: productId.toString(), 
        type,
        userId: req.user?.id, // Securely attach User ID
        localAmount: isRanged ? customAmount.toString() : (product.amount || 0).toString()
      },
      idempotencyKey 
    );

    res.json({ ...result, isGuest: !req.user, userId: req.user?.id });
    
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================================================================
// 🔐 SECURE PURCHASE API (BLOCKS ATTACKS)
// ==================================================================
app.post('/api/purchase', optionalAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const { productId, mobile, amount, unit, paymentId, type } = purchaseSchema.parse(req.body);

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
    if (paymentIntent.status !== 'succeeded') {
      return res.status(403).json({ error: 'Payment not completed.' });
    }

    // ✅ SECURITY: Verify User Ownership (Prevent Hijacking)
    const originalPayerId = paymentIntent.metadata?.userId;
    const currentUser = req.user?.id;
    if (originalPayerId && currentUser && originalPayerId !== currentUser) {
      console.error(`[Security] 🚨 Account Mismatch: Payment belongs to ${originalPayerId}, claimed by ${currentUser}`);
      return res.status(403).json({ error: 'Security Violation: Payment ownership mismatch.' });
    }
    const finalUserId = originalPayerId || undefined;

    // ✅ SECURITY: Block & Refund Price Mismatches
    const paidAmount = paymentIntent.amount / 100;
    const paidCurrency = paymentIntent.currency.toUpperCase();
    const priceCheck = await priceVerificationService.verifyProductPrice(productId, paidAmount, paidCurrency);

    if (!priceCheck.valid && !['CACHE_MISS', 'NO_PRICE'].includes(priceCheck.code || '')) {
      console.error(`[Security] 🚨 BLOCKED: Price mismatch for ${paymentId}. Paid: ${paidAmount}, Expected: ${priceCheck.expectedPrice}`);
      try {
        await paymentService.refundPayment(paymentId);
      } catch (e) { console.error('Refund failed:', e); }
      return res.status(403).json({ error: 'Price verification failed. Payment refunded.' });
    }

    // Process
    const result = await processPurchase({
      paymentId,
      mobile,
      productId,
      amount: paidAmount,
      currency: unit || paidCurrency,
      type: type || 'UNKNOWN',
      userId: finalUserId
    }, 'API');

    return res.json({ ...result, isGuest: !finalUserId });

  } catch (error: any) {
    console.error("Purchase Error:", error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================================================================
// STATIC FILES
// ==================================================================
const DIST_PATH = path.join(process.cwd(), 'dist');
app.use(express.static(DIST_PATH));
app.get(/(.*)/, (_req, res) => res.sendFile(path.join(DIST_PATH, 'index.html')));

app.listen(Number(PORT), '0.0.0.0', () => console.log(`🚀 API Server running on port ${PORT}`));
