// server/Routes.ts

import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path'; 
import Stripe from 'stripe'; 
import cron from 'node-cron';
import rateLimit from 'express-rate-limit'; 
import helmet from 'helmet'; 
import { z } from 'zod';
import { dtoneService } from './dtone';
import { syncCountries } from './scripts/sync-countries';
import { syncOperators } from './scripts/sync-operators'; 
import { syncProducts } from './scripts/sync-products'; 
import { paymentService } from './payment'; 
import { db } from './db'; 

const app = express();

// Trust Proxy (Fixes the rate-limit error)
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' as any });

// ==================================================================
// 🔒 SECURITY CONFIGURATION (Adjusted)
// ==================================================================

// 1. Helmet - Content Security Policy
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for React
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"], 
      frameSrc: ["https://js.stripe.com"],
      connectSrc: ["'self'", "https://api.stripe.com", "ws:", "wss:"], // Allow WebSocket for Dev
      // ✅ FIX: Allow images from data URIs (flags) and HTTPS (operator logos)
      imgSrc: ["'self'", "data:", "https:"] 
    }
  }
}));

// 2. Determine Allowed Origins
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [])
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://127.0.0.1:5173'];

// 3. Helper to validate Origin
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

// 4. Strict CORS Middleware
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

// 5. Rate Limiter
const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, 
	max: 100,
	standardHeaders: true, 
	legacyHeaders: false, 
    validate: { xForwardedForHeader: false }, 
    message: { error: "Too many requests, please try again later." }
});

app.use('/api/', apiLimiter); 

// ✅ SECURITY: Webhook Replay Protection Set
const processedWebhooks = new Set<string>();

// ==================================================================
// 1. STRIPE WEBHOOK
// ==================================================================
app.post('/api/hooks/stripe', express.raw({ type: 'application/json' }), async (req: Request, res: Response): Promise<any> => {
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
        
        await processPurchase({
          paymentId: paymentIntent.id,
          mobile: paymentIntent.metadata.mobile,
          productId: Number(paymentIntent.metadata.productId),
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency.toUpperCase(),
          type: paymentIntent.metadata.type || 'UNKNOWN'
        });
      }
      res.json({ received: true });
    } catch (error: any) {
      console.error('Webhook handler failed:', error);
      res.status(500).send('Webhook handler failed');
    }
});

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
// 🧩 UNIFIED PURCHASE LOGIC
// ==================================================================
async function processPurchase(data: { paymentId: string, mobile: string, productId: number, amount: number, currency: string, type: string }) {
  const { paymentId, mobile, productId, amount, currency, type } = data;

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
        status: 'PENDING'
      }
    });
  } catch (err: any) {
    console.log(`[Purchase] Lock failed for ${paymentId} (Duplicate Request).`);
    const existing = await db.transaction.findUnique({ where: { paymentIntentId: paymentId } });
    const isSuccess = existing?.status === 'COMPLETED' || existing?.status === 'PENDING';
    return { success: isSuccess, ...existing, dbStatus: existing?.status };
  }

  console.log(`[Purchase] Lock Acquired. Processing order for ${paymentId}...`);
  const callbackUrl = process.env.DTONE_CALLBACK_URL ? `${process.env.DTONE_CALLBACK_URL}/api/hooks/dtone` : undefined;
  
  const result = await dtoneService.purchaseProduct(productId, mobile, amount, currency, type, callbackUrl);

  if (!result.success || !result.data) {
    console.error(`[Purchase] ❌ API Error: ${result.error}`);
    await paymentService.refundPayment(paymentId);
    
    await db.transaction.update({
      where: { paymentIntentId: paymentId },
      data: { status: 'REFUNDED', externalId: `failed_${paymentId}` }
    });
    return { success: false, error: result.error, code: result.code, refunded: true };
  }

  const statusId = result.data.statusId;
  let dbStatus = 'PENDING';

  if (statusId === 7) {
      dbStatus = 'COMPLETED';
      console.log(`[Purchase] ✅ Success! Top-up sent. DTOne Ref: ${result.data.externalId}`);
  } 
  else if ([3, 9].includes(statusId || 0)) { 
      console.warn(`[Purchase] ⚠️ Transaction Declined (Status ${statusId}). Refund initiated...`);
      await paymentService.refundPayment(paymentId);
      dbStatus = 'FAILED';
  } 
  else {
      console.log(`[Purchase] ⏳ Transaction Submitted (Status ${statusId}). Waiting for callback.`);
  }

  await db.transaction.update({
    where: { paymentIntentId: paymentId },
    data: { status: dbStatus, externalId: result.data.externalId }
  });

  return { 
    success: dbStatus === 'COMPLETED' || dbStatus === 'PENDING', 
    ...result.data, 
    dbStatus,
    refunded: dbStatus === 'FAILED'
  };
}


// ==================================================================
// API ROUTES
// ==================================================================

const purchaseSchema = z.object({
  productId: z.number().int().positive(), 
  mobile: z.string().min(7).max(15).regex(/^\+?[0-9]+$/, "Invalid mobile format"), 
  amount: z.number().positive(),
  unit: z.string().length(3).optional(),
  paymentId: z.string().startsWith("pi_", "Invalid Payment ID format"),
  type: z.string().optional()
});

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
    if (ranged === 'true') whereClause.type = { contains: 'RANGED' }; 

    const localProducts = await db.product.findMany({
      where: whereClause,
      orderBy: { amount: 'asc' }
    });

    if (localProducts.length > 0) {
      const mapped = localProducts.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        amount: p.amount ? `${p.amount.toFixed(2)} ${p.currency}` : 'N/A', 
        currency: p.currency,
        min: p.minAmount || 0,
        max: p.maxAmount || 0,
        subserviceId: p.serviceId,
        benefits: [] 
      }));
      return res.json(mapped);
    }

    console.log(`[Cache Miss] Fetching live products for Op ${opId}`);
    const result = await dtoneService.getProductsForOperator(opId, 1, 100, 'en');
    
    if (!result.success || !result.data) {
      return res.status(400).json({ error: result.error, code: result.code });
    }

    let apiProducts = result.data;
    if (currency) apiProducts = apiProducts.filter(p => p.currency === String(currency).toUpperCase());
    if (ranged === 'true') apiProducts = apiProducts.filter(p => p.type.includes('RANGED'));

    return res.json(apiProducts);

  } catch (error: any) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/create-payment-intent', async (req: Request, res: Response): Promise<any> => {
  const { amount, currency, mobile, productId, type } = req.body; 
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  if (!amount || !currency) return res.status(400).json({ error: 'Amount and currency are required' });
  
  try {
    const result = await paymentService.createPaymentIntent(
      amount, 
      currency, 
      { mobile, productId, type },
      idempotencyKey 
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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

app.post('/api/purchase', async (req: Request, res: Response): Promise<any> => {
  try {
    const cleanData = purchaseSchema.parse(req.body);
    const { productId, mobile, amount, unit, paymentId, type } = cleanData;

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
    if (paymentIntent.status !== 'succeeded') {
        console.warn(`[Security] 🚨 Blocked attempt to use unpaid Intent: ${paymentId}`);
        return res.status(403).json({ error: 'Payment not completed or failed.' });
    }

    const paidProductId = Number(paymentIntent.metadata?.productId);
    if (paidProductId && paidProductId !== productId) {
        console.warn(`[Security] 🚨 Product Mismatch! Paid: ${paidProductId}, Requested: ${productId}`);
        return res.status(403).json({ error: 'Security verification failed: Product mismatch.' });
    }

    const result = await processPurchase({
      paymentId, 
      mobile, 
      productId, 
      amount, 
      currency: unit || 'UNKNOWN', 
      type: type || 'UNKNOWN'
    });

    return res.json(result);

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

app.post('/api/hooks/dtone', async (req: Request, res: Response) => { 
  console.log('[DTOne Callback]', req.body);
  res.status(200).send('OK'); 
});

const DIST_PATH = path.join(process.cwd(), 'dist');
app.use(express.static(DIST_PATH));
app.get(/(.*)/, (_req: Request, res: Response) => res.sendFile(path.join(DIST_PATH, 'index.html')));

app.listen(Number(PORT), '0.0.0.0', () => console.log(`🚀 API Server running on port ${PORT}`));
