// server/Routes.ts

import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path'; 
import Stripe from 'stripe'; 
import { dtoneService } from './dtone';
import { syncCountries } from './scripts/sync-countries';
import { syncOperators } from './scripts/sync-operators'; 
import { syncProducts } from './scripts/sync-products'; // ✅ Import Product Sync
import { paymentService } from './payment'; 
import { db } from './db'; 

const app = express();
const PORT = process.env.PORT || 5000;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

app.use(cors());

// ==================================================================
// 💳 STRIPE WEBHOOK
// ==================================================================
app.post(
  '/api/stripe-webhook',
  express.raw({ type: 'application/json' }), 
  async (req: Request, res: Response): Promise<any> => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[Stripe Webhook] ⚠️ STRIPE_WEBHOOK_SECRET is missing in .env');
      return res.status(500).send('Webhook secret not configured');
    }

    if (!sig) return res.status(400).send('Missing signature');

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error(`[Stripe Webhook] ⚠️ Signature Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handleFailSafePurchase(paymentIntent);
      } else if (event.type === 'payment_intent.payment_failed') {
        console.log(`[Stripe Webhook] ❌ Payment Failed: ${event.data.object.id}`);
      }
      res.json({ received: true });
    } catch (error: any) {
      console.error('[Stripe Webhook] Handler Error:', error);
      res.status(500).send('Webhook handler failed');
    }
  }
);

app.use(express.json());

// ==================================================================
// 🧠 FAIL-SAFE FULFILLMENT
// ==================================================================
const handleFailSafePurchase = async (paymentIntent: Stripe.PaymentIntent) => {
  const stripeId = paymentIntent.id;
  const metadata = paymentIntent.metadata;

  console.log(`[Webhook] 💰 Payment ${stripeId} succeeded. Checking fulfillment...`);

  const existingTx = await db.transaction.findFirst({ where: { paymentIntentId: stripeId } });

  if (existingTx && (existingTx.status === 'COMPLETED' || existingTx.status === 'PENDING')) {
    console.log(`[Webhook] ✅ Transaction ${existingTx.externalId} already recorded. Skipping.`);
    return;
  }

  if (!metadata?.mobile || !metadata?.productId) {
    console.warn(`[Webhook] ⚠️ Missing metadata for ${stripeId}. Cannot auto-fulfill.`);
    return;
  }

  console.log(`[Webhook] 🔄 Initiating fail-safe purchase for ${metadata.mobile}...`);
  
  const result = await dtoneService.purchaseProduct(
    Number(metadata.productId),
    metadata.mobile,
    paymentIntent.amount / 100, 
    paymentIntent.currency.toUpperCase(),
    metadata.type
  );

  const status = result.success ? 'COMPLETED' : 'FAILED';
  
  if (existingTx) {
    await db.transaction.update({
      where: { id: existingTx.id },
      data: { status: status, externalId: result.data?.externalId || existingTx.externalId }
    });
  } else {
    await db.transaction.create({
      data: {
        externalId: result.data?.externalId || `retry_${Date.now()}`,
        paymentIntentId: stripeId,
        mobile: metadata.mobile,
        productId: Number(metadata.productId),
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        productType: metadata.type || 'UNKNOWN',
        status: status,
        paymentId: stripeId 
      }
    });
  }

  if (!result.success) {
    console.warn(`[Webhook] ⚠️ Fulfillment failed. Issuing refund for ${stripeId}`);
    await paymentService.refundPayment(stripeId);
    await db.transaction.updateMany({
        where: { paymentIntentId: stripeId },
        data: { status: 'REFUNDED' }
    });
  } else {
    console.log(`[Webhook] 🎉 Fail-safe purchase successful!`);
  }
};

// ==================================================================
// 🚀 CACHE SYSTEM
// ==================================================================
let COUNTRY_CACHE: any[] = [];
let OPERATOR_CACHE: any[] = []; 

const initializeCache = async () => {
  console.log('[Server] ⏳ Initializing Caches...');
  try {
    const countries = await syncCountries();
    if (countries) COUNTRY_CACHE = countries;

    const operators = await syncOperators();
    if (operators) OPERATOR_CACHE = operators;
    
    // ✅ Optional: Run product sync on startup if empty
    // await syncProducts(); 
    
    console.log(`[Server] 🚀 System Ready! Countries: ${COUNTRY_CACHE.length}, Operators: ${OPERATOR_CACHE.length}`);
  } catch (e) {
    console.error("Cache init failed", e);
  }
};

initializeCache();

// ⏰ Schedule Daily Syncs (every 24 hours)
setInterval(() => {
  console.log('[Server] ⏰ Running Daily Maintenance...');
  syncCountries().then(d => { if(d) COUNTRY_CACHE = d; });
  syncOperators().then(d => { if(d) OPERATOR_CACHE = d; });
  syncProducts(); // ✅ Sync Products
}, 1000 * 60 * 60 * 24);

// ==================================================================
// 🔒 SECURITY
// ==================================================================
const DTONE_STATUS = {
  CREATED: 1, CONFIRMED: 2, REJECTED: 3, CANCELLED: 4,
  SUBMITTED: 5, COMPLETED: 7, REVERSED: 8, DECLINED: 9
};

const verifyDtOneCallback = (req: Request): boolean => {
  const authHeader = req.headers.authorization;
  if (!process.env.DTONE_WEBHOOK_USER || !process.env.DTONE_WEBHOOK_PASS) return true; 
  if (!authHeader) return false;
  const [scheme, credentials] = authHeader.split(' ');
  if (scheme !== 'Basic' || !credentials) return false;
  const [user, pass] = Buffer.from(credentials, 'base64').toString().split(':');
  return user === process.env.DTONE_WEBHOOK_USER && pass === process.env.DTONE_WEBHOOK_PASS;
};

// ==================================================================
// API ROUTES
// ==================================================================

app.get('/api/countries', (_req: Request, res: Response): any => {
  return res.json(COUNTRY_CACHE);
});

app.get('/api/operators', (req: Request, res: Response): any => {
  const { country } = req.query;
  if (country) {
    const filtered = OPERATOR_CACHE.filter(op => op.countryCode === String(country).toUpperCase());
    return res.json(filtered);
  }
  return res.json(OPERATOR_CACHE);
});

// ✅ UPDATED: Product Route (Read from DB First)
app.post('/api/products', async (req: Request, res: Response): Promise<any> => {
  const { operatorId } = req.body; // 'lang' is ignored as DB is English
  
  if (!operatorId) return res.status(400).json({ error: 'Operator ID is required' });

  try {
    // 1. ⚡️ Try reading from Local DB (Fastest)
    const localProducts = await db.product.findMany({
      where: { operatorId: Number(operatorId) }
    });

    if (localProducts.length > 0) {
      // Map DB shape back to what Frontend expects
      const mapped = localProducts.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        // Reconstruct "10.00 USD" string format for frontend compatibility
        amount: p.amount ? `${p.amount.toFixed(2)} ${p.currency}` : 'N/A', 
        currency: p.currency,
        min: p.minAmount || 0,
        max: p.maxAmount || 0,
        subserviceId: p.serviceId,
        benefits: [] 
      }));
      return res.json(mapped);
    }

    // 2. 🐢 Fallback: Fetch from API if DB is empty
    console.log(`[Cache Miss] Fetching live products for Op ${operatorId}`);
    const result = await dtoneService.getProductsForOperator(operatorId, 1, 100, 'en');
    
    if (!result.success) {
      return res.status(400).json({ error: result.error, code: result.code });
    }
    return res.json(result.data);

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/create-payment-intent', async (req: Request, res: Response): Promise<any> => {
  const { amount, currency } = req.body;
  if (!amount || !currency) return res.status(400).json({ error: 'Amount and currency are required' });
  try {
    const result = await paymentService.createPaymentIntent(amount, currency);
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
    if (!result.success) {
      return res.status(404).json({ error: result.error, code: result.code });
    }
    return res.json(result.data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/purchase', async (req: Request, res: Response): Promise<any> => {
  const { productId, mobile, amount, unit, paymentId, type } = req.body;

  if (!productId || !mobile || !paymentId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const callbackUrl = process.env.DTONE_CALLBACK_URL
      ? `${process.env.DTONE_CALLBACK_URL}/api/callback`
      : undefined;

    const result = await dtoneService.purchaseProduct(
      productId, mobile, amount || 0, unit, type, callbackUrl
    );

    if (!result.success || !result.data) {
      console.error(`[Purchase] API Error: ${result.error}`);
      const refund = await paymentService.refundPayment(paymentId);
      
      return res.status(400).json({ 
        success: false,
        error: result.error, 
        code: result.code,
        refunded: !!refund,
        refundId: refund?.id
      });
    }

    const statusId = result.data.statusId;
    let dbStatus = 'PENDING';
    let shouldRefund = false;

    if (statusId === DTONE_STATUS.COMPLETED) {
      dbStatus = 'COMPLETED';
    } else if (statusId === DTONE_STATUS.REJECTED || statusId === DTONE_STATUS.DECLINED) {
      dbStatus = 'FAILED';
      shouldRefund = true;
    }

    let refund = null;
    if (shouldRefund) {
      console.warn(`[Purchase] ❌ Immediate Failure (Code ${statusId}). Refunding...`);
      refund = await paymentService.refundPayment(paymentId);
      if (refund) dbStatus = 'REFUNDED';
    }

    try {
      await db.transaction.create({
        data: {
          externalId: result.data.externalId,
          paymentIntentId: paymentId,
          paymentId: paymentId, 
          mobile: mobile,
          productId: Number(productId),
          amount: Number(amount || 0),
          currency: unit || 'UNKNOWN',
          productType: type || 'UNKNOWN',
          status: dbStatus
        }
      });
    } catch (dbError) {
      console.error("[DB] CRITICAL: Failed to save transaction:", dbError);
      if (!refund) refund = await paymentService.refundPayment(paymentId);
      
      return res.status(500).json({ 
        success: false,
        error: 'Database error - payment has been refunded',
        refunded: true,
        refundId: refund?.id
      });
    }

    return res.json({
      success: dbStatus === 'COMPLETED' || dbStatus === 'PENDING',
      ...result.data,
      dbStatus: dbStatus,
      refunded: !!refund,
      refundId: refund?.id
    });

  } catch (error: any) {
    console.error('[Purchase] Unexpected error:', error);
    try {
      const refund = await paymentService.refundPayment(paymentId);
      return res.status(500).json({ 
        success: false, 
        error: 'Internal server error - payment refunded',
        refunded: true 
      });
    } catch (refundError: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
});

app.post('/api/callback', async (req: Request, res: Response) => {
  if (!verifyDtOneCallback(req)) {
    console.warn(`[Callback] ⛔ Security blocked request from ${req.ip}`);
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const txn = req.body;
  const statusId = txn.status?.class?.id;
  const statusMsg = txn.status?.message || 'No details';
  const refId = txn.external_id;

  console.log(`\n🔔 [DTOne Callback] Ref: ${refId} | Code: ${statusId} (${txn.status?.class?.message})`);

  try {
    const existingTx = await db.transaction.findUnique({ where: { externalId: refId } });
    
    if (!existingTx) {
      console.warn("   ⚠️ Transaction not found in DB.");
      res.status(200).send('OK');
      return;
    }

    if (existingTx.status === 'COMPLETED' || existingTx.status === 'REFUNDED') {
      res.status(200).send('OK');
      return;
    }

    let newStatus = existingTx.status;

    switch (statusId) {
      case DTONE_STATUS.COMPLETED:
        console.log("   ✅ SUCCESS: Transaction finished successfully.");
        newStatus = 'COMPLETED';
        break;

      case DTONE_STATUS.REJECTED:
      case DTONE_STATUS.DECLINED:
      case DTONE_STATUS.CANCELLED:
      case DTONE_STATUS.REVERSED:
        console.error(`   ❌ FAILED: ${statusMsg}`);
        
        if (existingTx.paymentIntentId && existingTx.status !== 'REFUNDED') {
           await paymentService.refundPayment(existingTx.paymentIntentId);
           newStatus = 'REFUNDED';
        } else {
           newStatus = 'FAILED';
        }
        break;

      default:
        console.log("   ⏳ PENDING: Update received.");
        break;
    }

    await db.transaction.update({
      where: { externalId: refId },
      data: { status: newStatus }
    });

  } catch (e) {
    console.error("Callback Error:", e);
  }

  res.status(200).send('OK');
});

const DIST_PATH = path.join(process.cwd(), 'dist');
app.use(express.static(DIST_PATH));
app.get(/(.*)/, (_req: Request, res: Response) => {
  res.sendFile(path.join(DIST_PATH, 'index.html'));
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 API Server running on port ${PORT} (IPv4)`);
});
