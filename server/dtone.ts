// @ts-ignore
import dtone from '@api/dtone';
import dotenv from 'dotenv';
import { ApiResponse, LookupResult, Product, TransactionResult, Country } from './types';

dotenv.config();

// ==========================================
// 1. CONFIGURATION & FAIL-FAST
// ==========================================
const DTONE_API_KEY = process.env.DTONE_API_KEY;
const DTONE_API_SECRET = process.env.DTONE_API_SECRET;
const DTONE_MODE = process.env.DTONE_MODE || 'sandbox';

if (!DTONE_API_KEY || !DTONE_API_SECRET) {
  throw new Error('FATAL: Missing DTOne credentials in .env file');
}

dtone.auth(DTONE_API_KEY, DTONE_API_SECRET);

if (DTONE_MODE === 'production') {
  console.log('[DTOne] 🚀 Mode: PRODUCTION');
  dtone.server('https://dvs-api.dtone.com/v1');
} else {
  console.log('[DTOne] 🧪 Mode: SANDBOX');
  dtone.server('https://preprod-dvs-api.dtone.com/v1');
}

// ==========================================
// 2. UTILITY FUNCTIONS
// ==========================================

function validateMobileNumber(mobile: string): boolean {
  const cleanNumber = mobile.replace(/[\s-]/g, '');
  return /^\+?[1-9]\d{1,14}$/.test(cleanNumber);
}

function generateTransactionId(): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substr(2, 9);
  return `txn_${timestamp}_${randomStr}`;
}

function handleApiError(error: any, context: string): { error: string, code: string } {
  const msg = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown error';
  
  if (error.status === 401 || error.response?.status === 401) {
    console.error('[DTOne] ❌ AUTH ERROR: Check Credentials');
    return { error: 'Authentication failed', code: 'AUTH_ERROR' };
  }

  console.error(`[DTOne] ${context} Failed: ${msg}`);

  if (error.status === 422 || error.response?.status === 422) {
    return { error: msg, code: 'VALIDATION_ERROR' };
  }

  return { error: msg, code: 'API_ERROR' };
}

// ==========================================
// 3. SERVICE LOGIC
// ==========================================
export const dtoneService = {

  // ----------------------------------------
  // A. GET COUNTRIES (PAGINATION FIX)
  // ----------------------------------------
  async getCountries(serviceId: number = 1): Promise<ApiResponse<Country[]>> {
    if (!serviceId || serviceId <= 0) {
      return { success: false, error: 'Invalid service ID', code: 'INVALID_SERVICE_ID' };
    }

    console.log(`[DTOne] Fetching Countries for Service ${serviceId}...`);
    
    try {
      let page = 1;
      let allCountries: Country[] = [];
      let hasMore = true;

      while (hasMore) {
        // Fetch specific page
        const response = await dtone.getCountries({
          service_id: serviceId,
          page: page,
          per_page: 100
        });

        // Unwrap data
        const raw = response.data || response;
        const list = Array.isArray(raw) ? raw : (raw.data || raw.payload || []);

        if (list.length === 0) {
          hasMore = false; // Stop if no data on this page
        } else {
          // Map and add to our master list
          for (const c of list) {
            // Check both snake_case and camelCase just to be safe
            const iso = c.iso_code || c.isoCode;
            if (iso && c.name) {
              allCountries.push({
                iso_code: iso,
                name: c.name
              });
            }
          }
          
          // Check if we hit the limit, otherwise continue
          if (list.length < 100) {
             hasMore = false;
          } else {
             page++;
          }
        }
      }

      // Sort alphabetically
      allCountries.sort((a, b) => a.name.localeCompare(b.name));

      console.log(`[DTOne] ✅ Total Countries Found: ${allCountries.length}`);
      return { success: true, data: allCountries };

    } catch (error: any) {
      const err = handleApiError(error, 'Get Countries');
      return { success: false, error: err.error, code: err.code };
    }
  },

  // ----------------------------------------
  // B. LOOKUP MOBILE NUMBER
  // ----------------------------------------
  async lookupMobileNumber(mobile: string): Promise<ApiResponse<LookupResult>> {
    if (!validateMobileNumber(mobile)) {
      return { success: false, error: 'Invalid format', code: 'INVALID_MOBILE' };
    }

    try {
      const response = await dtone.postLookupMobileNumber({ mobile_number: mobile });
      const result = response.data || response;
      const match = (Array.isArray(result) ? result[0] : result) as any;

      if (match && match.identified) {
        return {
          success: true,
          data: {
            operatorId: match.id,
            operatorName: match.name,
            countryIso: match.country?.iso_code || 'Unknown',
            identified: true
          }
        };
      }
      return { success: false, error: 'Operator not found', code: 'OPERATOR_NOT_FOUND' };

    } catch (error: any) {
      const err = handleApiError(error, 'Lookup');
      return { success: false, error: err.error, code: err.code };
    }
  },

  // ----------------------------------------
  // C. GET PRODUCTS
  // ----------------------------------------
  async getProductsForOperator(
    operatorId: number, 
    serviceId: number = 1, 
    perPage: number = 50
  ): Promise<ApiResponse<Product[]>> {
    
    console.log(`[DTOne] Fetching Products: Op=${operatorId}, Svc=${serviceId}`);
    
    try {
      const response = await dtone.getProducts({
        operator_id: operatorId,
        service_id: serviceId, 
        per_page: perPage
      });
      
      const rawList = response.data || response;
      const list = (Array.isArray(rawList) ? rawList : ((rawList as any).payload || [])) as any[];

      const products: Product[] = list.map(p => {
        const dest = p.destination || {};
        let amount = 'N/A';
        
        if (typeof dest.amount === 'number') {
          amount = `${dest.amount} ${dest.unit}`;
        } else if (dest.amount?.min) {
           amount = `${dest.amount.min}-${dest.amount.max} ${dest.unit}`;
        }

        return {
          id: p.id,
          name: p.name,
          type: p.type,
          amount,
          currency: dest.unit,
          min: dest.amount?.min || 0,
          max: dest.amount?.max || 0
        };
      });

      return { success: true, data: products };

    } catch (error: any) {
      const err = handleApiError(error, 'Get Products');
      return { success: false, error: err.error, code: err.code };
    }
  },

  // ----------------------------------------
  // D. PURCHASE
  // ----------------------------------------
  async purchaseProduct(productId: number, mobile: string, amount: number): Promise<ApiResponse<TransactionResult>> {
    if (!validateMobileNumber(mobile)) {
      return { success: false, error: 'Invalid mobile number', code: 'INVALID_MOBILE' };
    }

    const externalId = generateTransactionId();
    console.log(`[DTOne] Purchasing Product ${productId} [Ref: ${externalId}]...`);

    try {
      const payload: any = {
        external_id: externalId,
        product_id: productId,
        credit_party_identifier: { mobile_number: mobile },
        auto_confirm: true
      };

      if (amount > 0) {
        payload.values = { destination: { amount: amount } };
      }

      const response = await dtone.postTransactionSync(payload);
      const data = (response.data || response) as any;

      return {
        success: true,
        data: {
          id: data.id,
          status: data.status?.message || data.status,
          externalId: data.external_id,
          message: data.status?.message
        }
      };

    } catch (error: any) {
      const err = handleApiError(error, 'Transaction');
      return { success: false, error: err.error, code: err.code };
    }
  },

  // ----------------------------------------
  // E. ONE-LINE TOPUP
  // ----------------------------------------
  async purchaseTopup(mobile: string, productId: number, amount: number = 0): Promise<ApiResponse<TransactionResult | LookupResult>> {
    console.log(`[DTOne] 🔄 Auto-Topup started for ${mobile}`);
    
    const lookup = await dtoneService.lookupMobileNumber(mobile);
    if (!lookup.success) return lookup; 

    console.log(`[DTOne] ➡️  Operator: ${lookup.data.operatorName}`);
    return await dtoneService.purchaseProduct(productId, mobile, amount);
  }
};
