import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path'; 
import { dtoneService } from './dtone';
import { syncCountries } from './scripts/sync-countries';
import { syncOperators } from './scripts/sync-operators'; 
import { paymentService } from './payment'; 
import { db } from './db'; 

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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

app.post('/api/products', async (req: Request, res: Response): Promise<any> => {
  const { operatorId } = req.body;
  if (!operatorId) return res.status(400).json({ error: 'Operator ID is required' });
  try {
    const result = await dtoneService.getProductsForOperator(operatorId);
    if (!result.success) {
      return res.status(400).json({ error: result.error, code: result.code });
    }
    return res.json(result.data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/purchase', async (req: Request, res: Response): Promise<any> => {
  const { productId, mobile, amount, unit, paymentId } = req.body;

  if (!productId || !mobile) return res.status(400).json({ error: 'Missing fields' });

  try {
    const callbackUrl = process.env.DTONE_CALLBACK_URL
      ? `${process.env.DTONE_CALLBACK_URL}/api/callback`
      : undefined;

    if (callbackUrl) console.log(`[Purchase] Attaching Callback: ${callbackUrl}`);

    // 1. Execute Purchase
    const result = await dtoneService.purchaseProduct(productId, mobile, amount || 0, unit, callbackUrl);

    // 2. Handle API Errors (Network/Auth)
    if (!result.success || !result.data) {
      if (paymentId) await paymentService.refundPayment(paymentId);
      return res.status(400).json({ error: result.error, code: result.code });
    }

    // 3. Handle Transaction Failures (DECLINED / REJECTED)
    const statusId = result.data.statusId;
    let dbStatus = 'PENDING';

    if (statusId === DTONE_STATUS.COMPLETED) dbStatus = 'COMPLETED';

    // 🛑 CRITICAL FIX: Refund immediately if declined
    if (statusId === DTONE_STATUS.REJECTED || statusId === DTONE_STATUS.DECLINED) {
      console.error(`[Purchase] ❌ Immediate Failure (Code ${statusId}): ${result.data.status}`);
      if (paymentId) {
        await paymentService.refundPayment(paymentId);
        dbStatus = 'REFUNDED';
      } else {
        dbStatus = 'FAILED';
      }
    };

    // 4. Save to Database
    try {
      await db.transaction.create({
        data: {
          externalId: result.data.externalId,
          paymentIntentId: paymentId || null,
          mobile: mobile,
          productId: Number(productId),
          amount: Number(amount || 0),
          status: dbStatus
        }
      });
    } catch (dbError) {
      console.error("[DB] Failed to save transaction:", dbError);
    }

    // 5. Return result with explicit success flag
    // 🛑 CRITICAL FIX: This tells the frontend it failed!
    return res.json({
      ...result.data,
      success: dbStatus === 'COMPLETED' || dbStatus === 'PENDING'
    });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});


// ==================================================================
// 🔔 DTONE CALLBACK (WEBHOOK)
// ==================================================================
app.post('/api/callback', async (req: Request, res: Response) => {
  const txn = req.body;
  const statusId = txn.status?.class?.id;
  const statusMsg = txn.status?.message || 'No details';
  const refId = txn.external_id;

  console.log(`\n🔔 [Callback] Ref: ${refId} | Code: ${statusId} (${txn.status?.class?.message})`);

  try {
    const existingTx = await db.transaction.findUnique({ where: { externalId: refId } });
    
    if (!existingTx) {
      console.warn("   ⚠️ Transaction not found in DB.");
      res.status(200).send('OK');
      return;
    }

    // Only update if status has changed (and isn't already final)
    if (existingTx.status === 'COMPLETED' || existingTx.status === 'REFUNDED') {
      res.status(200).send('OK');
      return;
    }

    let newStatus = existingTx.status;

    switch (statusId) {
      case DTONE_STATUS.COMPLETED: // 7
        console.log("   ✅ SUCCESS: Transaction finished successfully.");
        newStatus = 'COMPLETED';
        break;

      case DTONE_STATUS.REJECTED: // 3
      case DTONE_STATUS.DECLINED: // 9
      case DTONE_STATUS.CANCELLED: // 4
      case DTONE_STATUS.REVERSED: // 8
        console.error(`   ❌ FAILED: ${statusMsg}`);
        
        // 💰 AUTO-REFUND USER (if not already refunded)
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
// ✅ FIX: Use process.cwd() to always find the 'dist' folder at project root
const DIST_PATH = path.join(process.cwd(), 'dist');

app.use(express.static(DIST_PATH));

app.get(/(.*)/, (_req: Request, res: Response) => {
  res.sendFile(path.join(DIST_PATH, 'index.html'));
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 API Server running on port ${PORT} (IPv4)`);
});
