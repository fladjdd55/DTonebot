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
// 🔒 SECURITY HELPER (WEBHOOK)
// ==================================================================
const verifyWebhook = (req: Request): boolean => {
  const authHeader = req.headers.authorization;
  
  // If no credentials set in .env, allow all (Dev mode)
  if (!process.env.DTONE_WEBHOOK_USER || !process.env.DTONE_WEBHOOK_PASS) {
    return true; 
  }

  if (!authHeader) return false;

  // Basic Auth format: "Basic base64(user:pass)"
  const [scheme, credentials] = authHeader.split(' ');
  if (scheme !== 'Basic' || !credentials) return false;

  // Decode and check
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
  const { productId, mobile, amount, unit, paymentId, type } = req.body;

  if (!productId || !mobile || !paymentId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  let dbTransaction = null;

  try {
    const callbackUrl = process.env.DTONE_CALLBACK_URL
      ? `${process.env.DTONE_CALLBACK_URL}/api/callback`
      : undefined;

    // 1. Execute DTOne Purchase
    const result = await dtoneService.purchaseProduct(
      productId, 
      mobile, 
      amount || 0, 
      unit, 
      type, 
      callbackUrl
    );

    // 2. Handle API-level failures (network, auth, etc.)
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

    // 3. Determine transaction status
    const statusId = result.data.statusId;
    let dbStatus = 'PENDING';
    let shouldRefund = false;

    if (statusId === DTONE_STATUS.COMPLETED) {
      dbStatus = 'COMPLETED';
    } else if (statusId === DTONE_STATUS.REJECTED || statusId === DTONE_STATUS.DECLINED) {
      dbStatus = 'FAILED'; // Will become REFUNDED
      shouldRefund = true;
    }

    // 4. Trigger Immediate Refund if failed
    let refund = null;
    if (shouldRefund) {
      console.warn(`[Purchase] ❌ Immediate Failure (Code ${statusId}). Refunding...`);
      refund = await paymentService.refundPayment(paymentId);
      if (refund) dbStatus = 'REFUNDED';
    }

    // 5. Save to Database
    try {
      dbTransaction = await db.transaction.create({
        data: {
          externalId: result.data.externalId,
          paymentIntentId: paymentId,
          // ✅ FIX: Ensure 'paymentId' column matches your schema
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
      
      // If we haven't refunded yet, do it now because we can't track the order!
      if (!refund) {
        refund = await paymentService.refundPayment(paymentId);
      }
      
      return res.status(500).json({ 
        success: false,
        error: 'Database error - payment has been refunded',
        refunded: true,
        refundId: refund?.id
      });
    }

    // 6. Return response with clear success flag
    return res.json({
      success: dbStatus === 'COMPLETED' || dbStatus === 'PENDING',
      id: result.data.id,
      externalId: result.data.externalId,
      status: result.data.status,
      statusId: statusId,
      dbStatus: dbStatus,
      message: result.data.message,
      refunded: !!refund,
      refundId: refund?.id
    });

  } catch (error: any) {
    console.error('[Purchase] Unexpected error:', error);
    
    // Emergency refund
    try {
      const refund = await paymentService.refundPayment(paymentId);
      return res.status(500).json({ 
        success: false,
        error: 'Internal server error - payment refunded',
        refunded: true,
        refundId: refund?.id
      });
    } catch (refundError) {
      // Worst case: couldn't refund
      return res.status(500).json({ success: false, error: error.message });
    }
  }
});


// ==================================================================
// 🔔 DTONE CALLBACK (WEBHOOK)
// ==================================================================
app.post('/api/callback', async (req: Request, res: Response) => {
  
  // 🔒 1. Verify Request comes from DTOne
  if (!verifyWebhook(req)) {
    console.warn(`[Callback] ⛔ Security blocked request from ${req.ip}`);
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

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
