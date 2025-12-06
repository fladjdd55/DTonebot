import express, { Request, Response } from 'express';
import cors from 'cors';
import { dtoneService } from './dtone';
import { syncCountries } from './scripts/sync-countries';
import { syncOperators } from './scripts/sync-operators'; 

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// ==================================================================
// 🚀 CACHE SYSTEM
// ==================================================================
let COUNTRY_CACHE: any[] = [];
let OPERATOR_CACHE: any[] = []; 

const initializeCache = async () => {
  console.log('[Server] ⏳ Initializing Caches...');
  
  // 1. Sync Countries
  const countries = await syncCountries();
  if (countries) COUNTRY_CACHE = countries;

  // 2. Sync Operators
  const operators = await syncOperators();
  if (operators) OPERATOR_CACHE = operators;
  
  console.log(`[Server] 🚀 System Ready! Countries: ${COUNTRY_CACHE.length}, Operators: ${OPERATOR_CACHE.length}`);
};

// Start & Schedule Daily Updates
initializeCache();
setInterval(() => {
  console.log('[Server] ⏰ Running Daily Maintenance...');
  syncCountries().then(d => { if(d) COUNTRY_CACHE = d; });
  syncOperators().then(d => { if(d) OPERATOR_CACHE = d; });
}, 1000 * 60 * 60 * 24); // 24 Hours


// ==================================================================
// ROUTES
// ==================================================================

app.get('/api/countries', (req: Request, res: Response): any => {
  return res.json(COUNTRY_CACHE);
});

// 🆕 NEW ROUTE: Serve Operators from Cache
app.get('/api/operators', (req: Request, res: Response): any => {
  const { country } = req.query;
  
  // Optional: Filter by country if requested
  if (country) {
    const filtered = OPERATOR_CACHE.filter(op => op.countryCode === String(country).toUpperCase());
    return res.json(filtered);
  }
  
  return res.json(OPERATOR_CACHE);
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

app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
});
