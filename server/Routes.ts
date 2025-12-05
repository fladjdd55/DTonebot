import express, { Request, Response } from 'express';
import cors from 'cors';
import { getCountryCallingCode, CountryCode } from 'libphonenumber-js';
// @ts-ignore
import { dtoneService } from './dtone';

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// ==================================================================
// ROUTE 1: GET COUNTRIES
// ==================================================================
app.get('/api/countries', async (req: Request, res: Response): Promise<any> => {
  try {
    // 1. Fetch clean list from DTOne Service (Service ID 1 = Mobile)
    const apiResponse = await dtoneService.getCountries(1);

    if (!apiResponse.success) {
      return res.status(500).json({ error: apiResponse.error });
    }

    // 2. Enrich with Dial Codes
    // The service returns objects with { iso_code, name }
    const rawCountries = apiResponse.data as any[];
    
    const enrichedCountries = rawCountries.map((c) => {
      let dialCode = '';
      // Ensure we have a valid ISO string
      const isoUpper = (c.iso_code || '').toUpperCase() as CountryCode;

      try {
        dialCode = `+${getCountryCallingCode(isoUpper)}`;
      } catch (e) {
        // Ignore countries with no standard dial code
      }

      return {
        name: c.name,
        code: c.iso_code,      // ISO2
        iso3: c.iso_code,      // Fallback ISO3
        dialCode: dialCode
      };
    });

    // 3. Filter invalid
    const validCountries = enrichedCountries.filter(c => c.dialCode !== '');

    return res.json(validCountries);

  } catch (error: any) {
    console.error('Countries Error:', error.message);
    return res.status(500).json({ error: 'Failed to load countries' });
  }
});

// ... (Your other routes: Lookup, Products, Purchase) ...
// (Keep them exactly as they were)

// ==================================================================
// ROUTE 2: LOOKUP
// ==================================================================
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

// ==================================================================
// ROUTE 3: PRODUCTS
// ==================================================================
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

// ==================================================================
// ROUTE 4: PURCHASE
// ==================================================================
app.post('/api/purchase', async (req: Request, res: Response): Promise<any> => {
  const { productId, mobile, amount } = req.body;
  if (!productId || !mobile) return res.status(400).json({ error: 'Missing fields' });

  try {
    const result = await dtoneService.purchaseProduct(productId, mobile, amount || 0);
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
