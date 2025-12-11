// server/Routes.ts

import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path'; 
import Stripe from 'stripe'; 
import cron from 'node-cron';
import { dtoneService } from './dtone';
import { syncCountries } from './scripts/sync-countries';
import { syncOperators } from './scripts/sync-operators'; 
import { syncProducts } from './scripts/sync-products'; 
import { paymentService } from './payment'; 
import { db } from './db'; 

const app = express();
const PORT = process.env.PORT || 5000;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' as any });

app.use(cors());

// ==================================================================
// 1. STRIPE WEBHOOK (Must be BEFORE express.json)
// ==================================================================
// ✅ FIX: Use express.raw() to verify Stripe signatures correctly
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

    try {
      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`[Webhook] Payment Succeeded: ${paymentIntent.id}`);
        
        // ✅ Uses unified race-proof logic
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

// ✅ GLOBAL PARSER: Now we can use JSON for everything else
app.use(express.json());


// ==================================================================
// 🚀 CACHE & SCHEDULER (Full Logic)
// ==================================================================
let COUNTRY_CACHE: any[] = [];
let OPERATOR_CACHE: any[] = []; 

// 1. Initial Load (On Server Start)
const initializeCache = async () => {
  console.log('[Server] ⏳ Initializing Caches...');
  try {
    const c = await syncCountries(); if(c) COUNTRY_CACHE = c;
    const o = await syncOperators(); if(o) OPERATOR_CACHE = o;
    
    // ✅ CONTROLLED SYNC: Only run if .env says so
    if (process.env.SYNC_ON_STARTUP === 'true') {
      console.log('[Server] 📦 SYNC_ON_STARTUP=true. Starting product sync...');
      syncProducts(); // Run in background (don't await)
    } else {
      console.log('[Server] ⏭️  SYNC_ON_STARTUP=false. Skipping product sync.');
    }
    
    console.log(`[Server] 🚀 System Ready!`);
  } catch (e) { console.error("Cache init failed", e); }
};

// Run immediately on start
initializeCache();

// 2. Cron Schedule (Runs daily at 03:00 AM)
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
// 🧩 UNIFIED PURCHASE LOGIC (Race-Condition Proof)
// ==================================================================
async function processPurchase(data: { paymentId: string, mobile: string, productId: number, amount: number, currency: string, type: string }) {
  const { paymentId, mobile, productId, amount, currency, type } = data;

  // 1. 🔒 ATTEMPT LOCK: Try to create PENDING record first
  try {
    await db.transaction.create({
      data: {
        externalId: `pending_${paymentId}`, // Temporary ID
        paymentIntentId: paymentId,
        paymentId: paymentId,
        mobile,
        productId,
        amount,
        currency,
        productType: type,
        status: 'PENDING' // ⏳ Lock status
      }
    });
  } catch (err: any) {
    // 🛑 If UNIQUE constraint fails, it means another process (Webhook or API) won the race
    console.log(`[Purchase] Lock failed for ${paymentId} (Duplicate Request). Skipping.`);
    
    // Fetch the existing one to return valid status to API
    const existing = await db.transaction.findUnique({ where: { paymentIntentId: paymentId } });
    return { success: existing?.status === 'COMPLETED', ...existing, dbStatus: existing?.status };
  }

  // 2. 🚀 EXECUTE: We won the lock, so WE call DTOne
  console.log(`[Purchase] Lock Acquired. Processing order for ${paymentId}...`);
  const callbackUrl = process.env.DTONE_CALLBACK_URL ? `${process.env.DTONE_CALLBACK_URL}/api/hooks/dtone` : undefined;
  
  const result = await dtoneService.purchaseProduct(productId, mobile, amount, currency, type, callbackUrl);

  // 3. 💾 UPDATE: Handle the result
  
  // A. NETWORK/API ERROR (Didn't even get a status code)
  if (!result.success || !result.data) {
    console.error(`[Purchase] ❌ API Error: ${result.error}`);
    await paymentService.refundPayment(paymentId);
    
    await db.transaction.update({
      where: { paymentIntentId: paymentId },
      data: { status: 'REFUNDED', externalId: `failed_${paymentId}` }
    });
    return { success: false, error: result.error, code: result.code, refunded: true };
  }

  // B. CHECK DTONE STATUS ID
  const statusId = result.data.statusId;
  let dbStatus = 'PENDING';

  if (statusId === 7) {
      // ✅ CASE 1: SUCCESS
      dbStatus = 'COMPLETED';
      console.log(`[Purchase] ✅ Success! Top-up sent. DTOne Ref: ${result.data.externalId}`);
  } 
  else if ([3, 9].includes(statusId || 0)) { 
      // ❌ CASE 2: HARD FAILURE (Rejected/Declined)
      console.warn(`[Purchase] ⚠️ Transaction Declined (Status ${statusId}). Refund initiated...`);
      await paymentService.refundPayment(paymentId);
      dbStatus = 'FAILED';
  } 
  else {
      // ⏳ CASE 3: PENDING/OTHER
      console.log(`[Purchase] ⏳ Transaction Submitted (Status ${statusId}). Waiting for callback.`);
  }

  // Update Database with Final Status
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
// API ROUTES
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
    
    // 1. Build DB Filter
    const whereClause: any = { operatorId: opId };
    if (currency) whereClause.currency = String(currency).toUpperCase();
    if (ranged === 'true') whereClause.type = { contains: 'RANGED' }; 

    // 2. Fetch from DB
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

    // 3. Fallback: Live API
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
  
  if (!amount || !currency) return res.status(400).json({ error: 'Amount and currency are required' });
  
  try {
    const result = await paymentService.createPaymentIntent(amount, currency, {
      mobile,
      productId,
      type
    });
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

// ✅ UPDATED PURCHASE ROUTE
app.post('/api/purchase', async (req: Request, res: Response): Promise<any> => {
  const { productId, mobile, amount, unit, paymentId, type } = req.body;
  if (!productId || !mobile || !paymentId) return res.status(400).json({ error: 'Missing required fields' });

  try {
    // Call the unified, race-proof logic
    const result = await processPurchase({
      paymentId, 
      mobile, 
      productId: Number(productId), 
      amount: Number(amount || 0), 
      currency: unit || 'UNKNOWN', 
      type: type || 'UNKNOWN'
    });

    return res.json(result);

  } catch (error: any) {
    console.error("Purchase API Error:", error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Callback Route
app.post('/api/hooks/dtone', async (req: Request, res: Response) => { 
  console.log('[DTOne Callback]', req.body);
  res.status(200).send('OK'); 
});

const DIST_PATH = path.join(process.cwd(), 'dist');
app.use(express.static(DIST_PATH));
app.get(/(.*)/, (_req: Request, res: Response) => res.sendFile(path.join(DIST_PATH, 'index.html')));

app.listen(Number(PORT), '0.0.0.0', () => console.log(`🚀 API Server running on port ${PORT}`));
