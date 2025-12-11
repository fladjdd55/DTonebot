// server/Routes.ts

import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path'; 
import Stripe from 'stripe'; 
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
app.use(express.json());

// ==================================================================
// 💳 STRIPE WEBHOOK
// ==================================================================
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response): Promise<any> => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(500).send('Webhook secret not configured');
    if (!sig) return res.status(400).send('Missing signature');

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handleFailSafePurchase(paymentIntent);
      }
      res.json({ received: true });
    } catch (error: any) {
      res.status(500).send('Webhook handler failed');
    }
});

// ==================================================================
// 🧠 FAIL-SAFE LOGIC
// ==================================================================
const handleFailSafePurchase = async (paymentIntent: Stripe.PaymentIntent) => {
  const stripeId = paymentIntent.id;
  const metadata = paymentIntent.metadata;
  const existingTx = await db.transaction.findFirst({ where: { paymentIntentId: stripeId } });

  if (existingTx && (existingTx.status === 'COMPLETED' || existingTx.status === 'PENDING')) return;
  if (!metadata?.mobile || !metadata?.productId) return;

  const result = await dtoneService.purchaseProduct(
    Number(metadata.productId), metadata.mobile, paymentIntent.amount / 100, 
    paymentIntent.currency.toUpperCase(), metadata.type
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
    await paymentService.refundPayment(stripeId);
    await db.transaction.updateMany({ where: { paymentIntentId: stripeId }, data: { status: 'REFUNDED' } });
  }
};

// ==================================================================
// 🚀 CACHE & SYNC
// ==================================================================
let COUNTRY_CACHE: any[] = [];
let OPERATOR_CACHE: any[] = []; 

const initializeCache = async () => {
  try {
    const c = await syncCountries(); if(c) COUNTRY_CACHE = c;
    const o = await syncOperators(); if(o) OPERATOR_CACHE = o;
    syncProducts(); 
    console.log(`[Server] 🚀 System Ready!`);
  } catch (e) { console.error("Cache init failed", e); }
};
initializeCache();

setInterval(() => {
  syncCountries().then(d => { if(d) COUNTRY_CACHE = d; });
  syncOperators().then(d => { if(d) OPERATOR_CACHE = d; });
  syncProducts();
}, 1000 * 60 * 60 * 24);

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

// ✅ UPDATED: Pass metadata to Stripe
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

app.post('/api/purchase', async (req: Request, res: Response): Promise<any> => {
  const { productId, mobile, amount, unit, paymentId, type } = req.body;
  if (!productId || !mobile || !paymentId) return res.status(400).json({ error: 'Missing required fields' });

  try {
    const callbackUrl = process.env.DTONE_CALLBACK_URL ? `${process.env.DTONE_CALLBACK_URL}/api/callback` : undefined;
    const result = await dtoneService.purchaseProduct(productId, mobile, amount || 0, unit, type, callbackUrl);

    if (!result.success || !result.data) {
      const refund = await paymentService.refundPayment(paymentId);
      return res.status(400).json({ success: false, error: result.error, code: result.code, refunded: !!refund });
    }

    const statusId = result.data.statusId;
    let dbStatus = 'PENDING';
    if (statusId === 7) dbStatus = 'COMPLETED';
    else if ([3, 9].includes(statusId || 0)) {
        await paymentService.refundPayment(paymentId);
        dbStatus = 'FAILED';
    }

    await db.transaction.create({
      data: {
        externalId: result.data.externalId, paymentIntentId: paymentId, paymentId: paymentId, 
        mobile, productId: Number(productId), amount: Number(amount||0), 
        currency: unit||'UNKNOWN', productType: type||'UNKNOWN', status: dbStatus 
      }
    });

    return res.json({ success: dbStatus === 'COMPLETED' || dbStatus === 'PENDING', ...result.data, dbStatus });

  } catch (error: any) {
    await paymentService.refundPayment(paymentId);
    return res.status(500).json({ success: false, error: 'Internal server error', refunded: true });
  }
});

app.post('/api/callback', async (req: Request, res: Response) => { res.status(200).send('OK'); });

const DIST_PATH = path.join(process.cwd(), 'dist');
app.use(express.static(DIST_PATH));
app.get(/(.*)/, (_req: Request, res: Response) => res.sendFile(path.join(DIST_PATH, 'index.html')));

app.listen(Number(PORT), '0.0.0.0', () => console.log(`🚀 API Server running on port ${PORT}`));
