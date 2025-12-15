// server/Routes.ts

import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path'; 
import Stripe from 'stripe'; 
import cron from 'node-cron';
import rateLimit from 'express-rate-limit'; 
import helmet from 'helmet'; 
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

console.log(`🔒 CORS Configured. Environment: ${process.env.NODE_ENV}`);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100,
  standardHeaders: true, 
  legacyHeaders: false, 
  validate: { xForwardedForHeader: false }, 
  message: { error: "Too many requests, please try again later." }
});

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Only 10 auth attempts per 15 minutes
  message: { error: "Too many login attempts. Please try again later." }
});

app.use('/api/', apiLimiter); 

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

  // 1. Check if already processed
  const existing = await db.transaction.findUnique({
    where: { paymentIntentId: paymentId }
  });

  if (existing) {
    // Already completed - skip
    if (existing.status === 'COMPLETED') {
      console.log(`[Purchase] ⏭️ Already completed: ${paymentId}`);
      return { success: true, ...existing, dbStatus: 'COMPLETED', alreadyProcessed: true };
    }

    // Already failed/refunded - skip
    if (existing.status === 'REFUNDED' || existing.status === 'FAILED') {
      console.log(`[Purchase] ⏭️ Already failed/refunded: ${paymentId}`);
      return { success: false, ...existing, dbStatus: existing.status, alreadyProcessed: true };
    }

    // ✅ FIX: If PENDING and someone else is processing, BACK OFF
    if (existing.status === 'PENDING') {
      const ageMs = Date.now() - new Date(existing.createdAt).getTime();
      
      // If record is fresh (< 60s), let the original processor finish
      if (ageMs < 60000) {
        console.log(`[Purchase] ⏭️ Already being processed by ${existing.processedVia} (${Math.round(ageMs/1000)}s old), ${source} backing off`);
        return { success: true, dbStatus: 'PENDING', alreadyProcessed: true };
      }
      
      // If record is stale (> 60s), take over
      console.log(`[Purchase] ⚠️ Stale PENDING record (${Math.round(ageMs/1000)}s), ${source} taking over`);
    }
  }

  // 2. Create lock (only if new)
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
      console.log(`[Purchase] 🔒 Lock acquired via ${source}: ${paymentId}${userId ? ` (User: ${userId})` : ' (Guest)'}`);
    } catch (err: any) {
      if (err.code === 'P2002') {
        // Someone else got the lock first - back off
        console.log(`[Purchase] ⏭️ Lock conflict for ${paymentId}, backing off...`);
        const check = await db.transaction.findUnique({ where: { paymentIntentId: paymentId } });
        return {
          success: check?.status === 'COMPLETED',
          dbStatus: check?.status,
          alreadyProcessed: true
        };
      }
      throw err;
    }
  } else {
    // Update processedVia for tracking (but we already decided to proceed above)
    await db.transaction.update({
      where: { paymentIntentId: paymentId },
      data: { processedVia: source }
    });
  }

  // 3. Execute DTOne Purchase
  console.log(`[Purchase] 🚀 Processing via ${source}: ${paymentId}`);

  const callbackUrl = process.env.DTONE_CALLBACK_URL
    ? `${process.env.DTONE_CALLBACK_URL}/api/hooks/dtone`
    : undefined;

  const result = await dtoneService.purchaseProduct(
    productId, mobile, amount, currency, type, callbackUrl
  );

  // 4. Handle Failure
  if (!result.success || !result.data) {
    console.error(`[Purchase] ❌ DTOne Error: ${result.error}`);

    const refund = await paymentService.refundPayment(paymentId);

    await db.transaction.update({
      where: { paymentIntentId: paymentId },
      data: {
        status: refund ? 'REFUNDED' : 'REFUND_FAILED',
        externalId: `failed_${paymentId}`
      }
    });

    return { success: false, error: result.error, code: result.code, refunded: !!refund };
  }

  // 5. Handle Success/Pending
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
    data: {
      status: dbStatus,
      externalId: result.data.externalId
    }
  });

  return {
    success: dbStatus === 'COMPLETED' || dbStatus === 'PENDING',
    ...result.data,
    dbStatus,
    refunded: dbStatus === 'FAILED'
  };
}

// ==================================================================
// 1. STRIPE WEBHOOK (BACKUP) - Must be BEFORE express.json()
// ==================================================================
app.post('/api/hooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response): Promise<any> => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) return res.status(500).send('Webhook secret not configured');
    if (!sig) return res.status(400).send('Missing signature');

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook Signature Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (processedWebhooks.has(event.id)) {
      console.log(`[Webhook] ⚠️ Duplicate event ${event.id}, ignoring.`);
      return res.json({ received: true });
    }
    processedWebhooks.add(event.id);
    setTimeout(() => processedWebhooks.delete(event.id), 24 * 60 * 60 * 1000);

    try {
      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`[Webhook] Payment Succeeded: ${paymentIntent.id}`);

        const existing = await db.transaction.findUnique({
          where: { paymentIntentId: paymentIntent.id }
        });

        if (existing && ['COMPLETED', 'REFUNDED', 'FAILED'].includes(existing.status)) {
          console.log(`[Webhook] ⏭️ Already finalized: ${paymentIntent.id}`);
          return res.json({ received: true });
        }

        if (existing?.processedVia === 'API' && existing.status === 'PENDING') {
          const ageMs = Date.now() - new Date(existing.createdAt).getTime();
          if (ageMs < 30000) {
            console.log(`[Webhook] ⏳ API processing (${Math.round(ageMs/1000)}s old), waiting...`);
            return res.json({ received: true });
          }
          console.log(`[Webhook] ⚠️ API seems stuck, taking over: ${paymentIntent.id}`);
        }

        if (!existing || existing.status === 'PENDING') {
          console.log(`[Webhook] 🔄 Processing payment: ${paymentIntent.id}`);
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
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error('Webhook handler failed:', error);
      res.status(500).send('Webhook handler failed');
    }
  }
);

// Now parse JSON for all other routes
app.use(express.json());

// ==================================================================
// 🚀 CACHE & SCHEDULER
// ==================================================================
let COUNTRY_CACHE: any[] = [];
let OPERATOR_CACHE: any[] = []; 

const initializeCache = async () => {
  console.log('[Server] ⏳ Initializing Caches...');
  try {
    const c = await syncCountries(); if(c) COUNTRY_CACHE = c;
    const o = await syncOperators(); if(o) OPERATOR_CACHE = o;
    
    if (process.env.SYNC_ON_STARTUP === 'true') {
      console.log('[Server] 📦 SYNC_ON_STARTUP=true. Starting product sync...');
      syncProducts(); 
    } else {
      console.log('[Server] ⏭️  SYNC_ON_STARTUP=false. Skipping product sync.');
    }
    console.log(`[Server] 🚀 System Ready!`);
  } catch (e) { console.error("Cache init failed", e); }
};

initializeCache();

cron.schedule('0 3 * * *', async () => {
  console.log('[Scheduler] 🌙 3 AM Sync Starting...');
  try {
    const c = await syncCountries(); if(c) COUNTRY_CACHE = c;
    const o = await syncOperators(); if(o) OPERATOR_CACHE = o;
    await syncProducts();
    console.log('[Scheduler] ✅ Daily sync complete.');
  } catch (err) {
    console.error('[Scheduler] ❌ Daily sync failed:', err);
  }
});

// ==================================================================
// VALIDATION SCHEMAS
// ==================================================================
const purchaseSchema = z.object({
  productId: z.number().int().positive(), 
  mobile: z.string().min(7).max(15).regex(/^\+?[0-9]+$/, "Invalid mobile format"), 
  amount: z.number().positive(),
  unit: z.string().length(3).optional(),
  paymentId: z.string().startsWith("pi_", "Invalid Payment ID format"),
  type: z.string().optional()
});

const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).optional()
});

const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required")
});

// ==================================================================
// 🔐 AUTHENTICATION ROUTES
// ==================================================================

// Register
app.post('/api/auth/register', authLimiter, async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);
    
    const result = await authService.register(email, password, name);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    return res.status(201).json({
      message: 'Registration successful',
      user: result.user,
      token: result.token
    });
    
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.issues.map(e => e.message)
      });
    }
    console.error('[Auth] Register error:', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', authLimiter, async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    
    const result = await authService.login(email, password);
    
    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }
    
    return res.json({
      message: 'Login successful',
      user: result.user,
      token: result.token
    });
    
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.issues.map(e => e.message)
      });
    }
    console.error('[Auth] Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// Get Current User (Protected)
app.get('/api/auth/me', requireAuth, async (req: Request, res: Response): Promise<any> => {
  return res.json({ user: req.user });
});

// Update Profile (Protected)
app.put('/api/auth/profile', requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, phone } = req.body;
    
    const result = await authService.updateProfile(req.user!.id, { name, phone });
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    return res.json({ user: result.user });
    
  } catch (error: any) {
    console.error('[Auth] Update profile error:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change Password (Protected)
app.post('/api/auth/change-password', requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    
    const result = await authService.changePassword(req.user!.id, currentPassword, newPassword);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    return res.json({ message: 'Password changed successfully' });
    
  } catch (error: any) {
    console.error('[Auth] Change password error:', error);
    return res.status(500).json({ error: 'Failed to change password' });
  }
});

// Get User's Transaction History (Protected)
app.get('/api/user/transactions', requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const skip = (page - 1) * limit;
    
    const [transactions, total] = await Promise.all([
      db.transaction.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        skip,
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
      db.transaction.count({ where: { userId: req.user!.id } })
    ]);
    
    return res.json({
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error: any) {
    console.error('[User] Get transactions error:', error);
    return res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// ==================================================================
// PUBLIC API ROUTES
// ==================================================================

app.get('/api/countries', (_req: Request, res: Response): any => res.json(COUNTRY_CACHE));

app.get('/api/operators', (req: Request, res: Response): any => {
  const { country } = req.query;
  if (country) {
    return res.json(OPERATOR_CACHE.filter(op => op.countryCode === String(country).toUpperCase()));
  }
  return res.json(OPERATOR_CACHE);
});

app.get('/api/products', async (req: Request, res: Response): Promise<any> => {
  try {
    const { operatorId, currency, ranged } = req.query; 
    if (!operatorId) return res.status(400).json({ error: 'Operator ID is required' });

    const opId = Number(operatorId);
    const whereClause: any = { operatorId: opId };
    if (currency) whereClause.currency = String(currency).toUpperCase();
    
    // ✅ Filter for ranged products if requested
    if (ranged === 'true') {
      whereClause.OR = [
        { type: { contains: 'RANGE' } },
        { minAmount: { not: null }, maxAmount: { not: null } }
      ];
    }

    const localProducts = await db.product.findMany({
      where: whereClause,
      orderBy: { amount: 'asc' }
    });

    if (localProducts.length > 0) {
      const mapped = localProducts.map(p => {
        // Determine if product is ranged
        const isRanged = p.type?.includes('RANGE') || 
                         (p.minAmount !== null && p.maxAmount !== null && p.minAmount !== p.maxAmount);
        
        return {
          id: p.id,
          name: p.name,
          type: p.type,
          amount: p.amount ? `${p.amount.toFixed(2)} ${p.currency}` : 'N/A', 
          currency: p.currency,
          min: p.minAmount || 0,
          max: p.maxAmount || 0,
          subserviceId: p.serviceId,
          benefits: [],
          // ✅ Cost fields (fixed and ranged)
          costPrice: p.costPrice,
          costPriceMin: p.costPriceMin,
          costPriceMax: p.costPriceMax,
          costCurrency: p.costCurrency || 'USD',
          // ✅ Helper flag for frontend
          isRanged
        };
      });
      return res.json(mapped);
    }

    console.log(`[Cache Miss] Fetching live products for Op ${opId}`);
    const result = await dtoneService.getProductsForOperator(opId, 1, 100, 'en');
    
    if (!result.success || !result.data) {
      return res.status(400).json({ error: result.error, code: result.code });
    }

    let apiProducts = result.data;
    if (currency) apiProducts = apiProducts.filter(p => p.currency === String(currency).toUpperCase());
    if (ranged === 'true') apiProducts = apiProducts.filter(p => 
      p.type.includes('RANGE') || (p.min > 0 && p.max > 0 && p.min !== p.max)
    );

    return res.json(apiProducts);

  } catch (error: any) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ error: error.message });
  }
});


app.post('/api/lookup', async (req: Request, res: Response): Promise<any> => {
  const { mobile } = req.body;
  if (!mobile) return res.status(400).json({ error: 'Mobile number is required' });
  try {
    const result = await dtoneService.lookupMobileNumber(mobile);
    if (!result.success) return res.status(404).json({ error: result.error, code: result.code });
    return res.json(result.data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ==================================================================
// PAYMENT INTENT (with Price Verification) - Supports Guest + User
// ==================================================================
app.post('/api/create-payment-intent', optionalAuth, async (req: Request, res: Response): Promise<any> => {
  const { amount, currency, mobile, productId, type } = req.body; 
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  if (!amount || !currency || !productId) {
    return res.status(400).json({ error: 'Amount, currency, and productId are required' });
  }

  try {
    // 🔒 PRICE VERIFICATION: Verify amount matches product price
    const priceCheck = await priceVerificationService.verifyProductPrice(
      productId,
      amount,
      currency
    );

    if (!priceCheck.valid && priceCheck.code !== 'CACHE_MISS' && priceCheck.code !== 'NO_PRICE') {
      console.warn(`[Security] 🚨 Price verification failed: ${priceCheck.error}`);
      return res.status(400).json({
        error: priceCheck.error,
        code: priceCheck.code,
        expectedPrice: priceCheck.expectedPrice,
        expectedCurrency: priceCheck.expectedCurrency
      });
    }

    // Create payment intent with user ID if logged in
    const result = await paymentService.createPaymentIntent(
      amount, 
      currency, 
      { 
        mobile, 
        productId, 
        type,
        userId: req.user?.id // Include user ID in metadata if logged in
      },
      idempotencyKey 
    );

    // Return user status along with payment intent
    res.json({
      ...result,
      isGuest: !req.user,
      userId: req.user?.id
    });
    
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================================================================
// API PURCHASE (PRIMARY) - Supports Guest + User
// ==================================================================
app.post('/api/purchase', optionalAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const cleanData = purchaseSchema.parse(req.body);
    const { productId, mobile, amount, unit, paymentId, type } = cleanData;

    // Verify payment succeeded
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
    if (paymentIntent.status !== 'succeeded') {
      console.warn(`[Security] 🚨 Unpaid Intent: ${paymentId}`);
      return res.status(403).json({ error: 'Payment not completed.' });
    }

    // Verify product matches
    const paidProductId = Number(paymentIntent.metadata?.productId);
    if (paidProductId && paidProductId !== productId) {
      console.warn(`[Security] 🚨 Product mismatch: paid=${paidProductId}, requested=${productId}`);
      return res.status(403).json({ error: 'Product mismatch.' });
    }

    // 🔒 PRICE VERIFICATION: Double-check payment amount matches product
    const paidAmount = paymentIntent.amount / 100;
    const paidCurrency = paymentIntent.currency.toUpperCase();

    const priceCheck = await priceVerificationService.verifyProductPrice(
      productId,
      paidAmount,
      paidCurrency
    );

    if (!priceCheck.valid && priceCheck.code !== 'CACHE_MISS' && priceCheck.code !== 'NO_PRICE') {
      console.warn(`[Security] 🚨 Purchase price mismatch: paid ${paidAmount} ${paidCurrency}, expected ${priceCheck.expectedPrice} ${priceCheck.expectedCurrency}`);
      // Don't block - payment already succeeded, but log it
      // In production, you might want to flag this for review
    }

    // Get user ID from request or payment metadata
    const userId = req.user?.id || paymentIntent.metadata?.userId || undefined;

    // Process (API is primary)
    const result = await processPurchase({
      paymentId,
      mobile,
      productId,
      amount: paidAmount,
      currency: unit || paidCurrency,
      type: type || 'UNKNOWN',
      userId
    }, 'API');

    return res.json({
      ...result,
      isGuest: !userId
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.issues.map((e: any) => e.message)
      });
    }
    console.error("Purchase API Error:", error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ==================================================================
// TRANSACTION STATUS CHECK
// ==================================================================
app.get('/api/transaction/:paymentId', async (req: Request, res: Response): Promise<any> => {
  const { paymentId } = req.params;
  try {
    const txn = await db.transaction.findUnique({
      where: { paymentIntentId: paymentId }
    });

    if (!txn) return res.json({ status: 'PENDING' });

    return res.json({ status: txn.status, externalId: txn.externalId });
  } catch (error: any) {
    console.error("Status Check Error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ==================================================================
// DTONE WEBHOOK (with IP + Basic Auth)
// ==================================================================
app.post('/api/hooks/dtone',
  dtoneIpWhitelist,
  dtoneBasicAuth,
  async (req: Request, res: Response): Promise<any> => {
    const { external_id, status } = req.body;

    if (!external_id) {
      return res.status(400).send('Missing external_id');
    }

    console.log(`[DTOne Callback] Received: ${external_id} → Status: ${status?.class?.id}`);

    try {
      const txn = await db.transaction.findFirst({
        where: { externalId: external_id }
      });

      if (!txn) {
        console.warn(`[DTOne Callback] Unknown transaction: ${external_id}`);
        return res.status(200).send('OK');
      }

      const statusId = status?.class?.id;

      if (statusId === 7) {
        await db.transaction.update({
          where: { id: txn.id },
          data: { status: 'COMPLETED' }
        });
        console.log(`[DTOne Callback] ✅ Transaction ${external_id} completed`);
      }
      else if ([3, 9].includes(statusId)) {
        if (txn.paymentIntentId && txn.status !== 'REFUNDED') {
          await paymentService.refundPayment(txn.paymentIntentId);
          await db.transaction.update({
            where: { id: txn.id },
            data: { status: 'REFUNDED' }
          });
          console.log(`[DTOne Callback] 💸 Transaction ${external_id} failed → Refunded`);
        }
      }

      res.status(200).send('OK');
    } catch (error: any) {
      console.error('[DTOne Callback] Error:', error);
      res.status(500).send('Internal error');
    }
  }
);

// ==================================================================
// STATIC FILES (Frontend)
// ==================================================================
const DIST_PATH = path.join(process.cwd(), 'dist');
app.use(express.static(DIST_PATH));
app.get(/(.*)/, (_req: Request, res: Response) => res.sendFile(path.join(DIST_PATH, 'index.html')));

app.listen(Number(PORT), '0.0.0.0', () => console.log(`🚀 API Server running on port ${PORT}`));

