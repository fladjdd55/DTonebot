import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path'; 
import { dtoneService } from './dtone';
import { syncCountries } from './scripts/sync-countries';
import { syncOperators } from './scripts/sync-operators'; 
import { paymentService } from './payment'; 

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
// API ROUTES
// ==================================================================

// FIX: Rename 'req' to '_req' to ignore unused variable
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
  const { productId, mobile, amount, unit } = req.body;
  if (!productId || !mobile) return res.status(400).json({ error: 'Missing fields' });
  try {
    const result = await dtoneService.purchaseProduct(productId, mobile, amount || 0, unit);
    if (!result.success) {
      return res.status(400).json({ error: result.error, code: result.code });
    }
    return res.json(result.data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ==================================================================
// 📂 SERVE REACT FRONTEND (MUST BE LAST)
// ==================================================================
app.use(express.static(path.join(__dirname, '../dist')));

// FIX: Rename 'req' to '_req'
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 API Server running on port ${PORT}`);
});
