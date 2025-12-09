import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path'; 
import Stripe from 'stripe'; // ✅ Import Stripe directly
import { dtoneService } from './dtone';
import { syncCountries } from './scripts/sync-countries';
import { syncOperators } from './scripts/sync-operators'; 
import { paymentService } from './payment'; 
import { db } from './db'; 

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Stripe locally for Webhook Verification
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

app.use(cors());

// ==================================================================
// 💳 STRIPE WEBHOOK (MUST BE BEFORE express.json)
// ==================================================================
// This endpoint catches "Payment Succeeded" events from Stripe directly.
// It acts as a "Fail-Safe" if the user closes their browser before the frontend finishes.
app.post(
  '/api/stripe-webhook',
  express.raw({ type: 'application/json' }), // 👈 Catch raw body for signature verification
  async (req: Request, res: Response): Promise<any> => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[Stripe Webhook] ⚠️ STRIPE_WEBHOOK_SECRET is missing in .env');
      return res.status(500).send('Webhook secret not configured');
    }

    if (!sig) {
      return res.status(400).send('Missing signature');
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error(`[Stripe Webhook] ⚠️ Signature Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
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

// ✅ NOW we can enable JSON parsing for all other routes
app.use(express.json());

// ==================================================================
// 🧠 FAIL-SAFE FULFILLMENT LOGIC
// ==================================================================
const handleFailSafePurchase = async (paymentIntent: Stripe.PaymentIntent) => {
  const stripeId = paymentIntent.id;
  const metadata = paymentIntent.metadata;

  console.log(`[Webhook] 💰 Payment ${stripeId} succeeded. Checking fulfillment...`);

  // 1. Check if we already fulfilled this locally
  const existingTx = await db.transaction.findFirst({
    where: { paymentIntentId: stripeId }
  });

  if (existingTx && (existingTx.status === 'COMPLETED' || existingTx.status === 'PENDING')) {
    console.log(`[Webhook] ✅ Transaction ${existingTx.externalId} already recorded. Skipping.`);
    return;
  }

  // 2. Validate Metadata (Must have mobile/product from server/payment.ts)
  if (!metadata?.mobile || !metadata?.productId) {
    console.warn(`[Webhook] ⚠️ Missing metadata for ${stripeId}. Cannot auto-fulfill.`);
    return;
  }

  // 3. Fulfill the Order (The "Fail-Safe")
  console.log(`[Webhook] 🔄 Initiating fail-safe purchase for ${metadata.mobile}...`);
  
  const result = await dtoneService.purchaseProduct(
    Number(metadata.productId),
    metadata.mobile,
    paymentIntent.amount / 100, // Convert cents back to main unit
    paymentIntent.currency.toUpperCase(),
    metadata.type
  );

  // 4. Update Database
  const status = result.success ? 'COMPLETED' : 'FAILED';
  
  if (existingTx) {
    // If record existed but was failed/abandoned, update it
    await db.transaction.update({
      where: { id: existingTx.id },
      data: { status: status, externalId: result.data?.externalId || existingTx.externalId }
    });
  } else {
    // If NO record exists (User closed browser immediately), create it
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
        paymentId: stripeId // Explicitly set paymentId column
      }
    });
  }

  // 5. If Purchase Failed -> Auto Refund
  if (!result.success) {
    console.warn(`[Webhook] ⚠️ Fulfillment failed. Issuing refund for ${stripeId}`);
    await paymentService.refundPayment(stripeId);
    
    // Update DB to REFUNDED
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
    
    console.log(`[Server] 🚀 System Ready! Countries: ${COUNTRY_CACHE.length}, Operators: ${OPERATOR_CACHE.length}`);
  } catch (e) {
    console.error("Cache init failed", e);
  }
};

initializeCache();

setInterval(() => {
  console.log('[Server] ⏰ Running Daily Maintenance...');
  syncCountries().then(d => { if(d) COUNTRY_CACHE = d; });
  syncOperators().then(d => { if(d) OPERATOR_CACHE = d; });
}, 1000 * 60 * 60 * 24);

// ==================================================================
// 🔢 DTONE STATUS CODES
// ==================================================================
const DTONE_STATUS = {
  CREATED: 1,
  CONFIRMED: 2,
  REJECTED: 3,
  CANCELLED: 4,
  SUBMITTED: 5,
  COMPLETED: 7,
  REVERSED: 8,
  DECLINED: 9
};

// ==================================================================
// 🔒 SECURITY HELPER (DTOne Callback)
// ==================================================================
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

app.post('/api/create-payment-intent', async (req: Request, res: Response): Promise<any> => {
  const { amount, currency, mobile, productId, type } = req.body;
  
  if (!amount || !currency) return res.status(400).json({ error: 'Amount and currency are required' });

  try {
    // Pass metadata so the Webhook can use it later
    const result = await paymentService.createPaymentIntent(amount, currency);
    // Note: You must update payment.ts to actually accept and save this metadata!
    
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

app.post('/api/products', async (req: Request, res: Response): Promise<any> => {
  const { operatorId, lang } = req.body;
  if (!operatorId) return res.status(400).json({ error: 'Operator ID is required' });
  try {
    const result = await dtoneService.getProductsForOperator(operatorId, 1, lang);
    if (!result.success) {
      return res.status(400).json({ error: result.error, code: result.code });
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

  let dbTransaction = null;

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
      dbTransaction = await db.transaction.create({
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
    } catch (refundError) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
});

// ==================================================================
// 🔔 DTONE CALLBACK (Basic Auth Security)
// ==================================================================
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

// ==================================================================
// 📂 SERVE REACT FRONTEND (MUST BE LAST)
// ==================================================================
const DIST_PATH = path.join(process.cwd(), 'dist');

app.use(express.static(DIST_PATH));

app.get(/(.*)/, (_req: Request, res: Response) => {
  res.sendFile(path.join(DIST_PATH, 'index.html'));
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 API Server running on port ${PORT} (IPv4)`);
});
