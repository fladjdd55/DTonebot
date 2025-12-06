import express, { Request, Response } from 'express';
import cors from 'cors';
import { getCountryCallingCode, CountryCode } from 'libphonenumber-js';
import isoCountries from 'i18n-iso-countries';
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
    const rawCountries = apiResponse.data as any[];
    
    const enrichedCountries = rawCountries.map((c) => {
      let dialCode = '';
      const iso3 = (c.iso_code || '').toUpperCase();
      
      // Convert ISO Alpha-3 (USA) to ISO Alpha-2 (US)
      // libphonenumber-js strictly requires 2-letter codes
      const iso2 = isoCountries.alpha3ToAlpha2(iso3) as CountryCode;

      if (iso2) {
        try {
          dialCode = `+${getCountryCallingCode(iso2)}`;
        } catch (e) {
          // Ignore countries with no standard dial code or invalid conversion
        }
      }

      return {
        name: c.name,
        code: iso2 || iso3,    // Prefer ISO2 for frontend flags/validation
        iso3: iso3,
        dialCode: dialCode
      };
    });

    // 3. Filter invalid (only keep ones where we successfully found a dial code)
    const validCountries = enrichedCountries.filter(c => c.dialCode !== '');

    console.log(`[API] Returning ${validCountries.length} valid countries (filtered from ${rawCountries.length})`);
    return res.json(validCountries);

  } catch (error: any) {
    console.error('Countries Error:', error.message);
    return res.status(500).json({ error: 'Failed to load countries' });
  }
});

// ... (Rest of your routes: Lookup, Products, Purchase stay the same) ...

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
