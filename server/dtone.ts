// server/dtone.ts

// @ts-ignore
import dtone from '@api/dtone';
import dotenv from 'dotenv';
import { ApiResponse, LookupResult, Product, TransactionResult, Country } from './types';

dotenv.config();

// ==========================================
// 1. CONFIGURATION
// ==========================================
const DTONE_API_KEY = process.env.DTONE_API_KEY;
const DTONE_API_SECRET = process.env.DTONE_API_SECRET;
const DTONE_MODE = process.env.DTONE_MODE || 'sandbox';

// 1.15 = 15% profit on top of wholesale rate
// ✅ UPDATED: Read from .env, default to 1.15 if missing
const FALLBACK_MARGIN = Number(process.env.DTONE_FALLBACK_MARGIN) || 1.15;
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

function formatMobileForDtOne(mobile: string): string {
    let cleanMobile = mobile.replace(/[\s\-\(\)]/g, '');
    if (!cleanMobile.startsWith('+')) {
      cleanMobile = `+${cleanMobile}`;
    }
    return cleanMobile;
}

function validateMobileNumber(mobile: string): boolean {
  return /^\+[1-9][0-9]{6,14}$/.test(mobile);
}

function generateTransactionId(): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substr(2, 9);
  return `txn_${timestamp}_${randomStr}`;
}

function handleApiError(error: any, context: string): { error: string, code: string } {
  const msg = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown error';
  
  if (error.response?.data) {
     console.error(`❌ [DTOne ${context}] Full API Error Response:`, JSON.stringify(error.response.data, null, 2));
  } else {
     console.error(`❌ [DTOne ${context}] Error:`, error.message);
  }

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
  // A. GET COUNTRIES
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
        const response = await dtone.getCountries({
          service_id: serviceId,
          page: page,
          per_page: 100
        });

        const raw = response.data || response;
        const list = (Array.isArray(raw) ? raw : (raw.data || raw.payload || [])) as any[];

        if (list.length === 0) {
          hasMore = false;
        } else {
          for (const c of list) {
            const iso = c.iso_code || c.isoCode;
            if (iso && c.name) {
              allCountries.push({
                iso_code: iso,
                name: c.name
              });
            }
          }
          
          if (list.length < 100) {
             hasMore = false;
          } else {
             page++;
          }
        }
      }

      allCountries.sort((a, b) => a.name.localeCompare(b.name));
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
    const cleanMobile = formatMobileForDtOne(mobile); 
    console.log(`[DTOne] Looking up operator for: ${cleanMobile}`);

    if (!validateMobileNumber(cleanMobile)) {
      return { success: false, error: 'Invalid mobile format (E.164 required)', code: 'INVALID_MOBILE' };
    }

    try {
      const response = await dtone.postLookupMobileNumber({ mobile_number: cleanMobile });
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
  // C. GET PRODUCTS (UPDATED WITH MARGIN LOGIC)
  // ----------------------------------------
  
   async getProductsForOperator(
    operatorId: number, 
    serviceId: number = 1, 
    perPage: number = 100,
    lang: string = 'en'
  ): Promise<ApiResponse<Product[]>> {
    
    console.log(`[DTOne] Fetching Products: Op=${operatorId}, Lang=${lang}`);
    
    try {
      let page = 1;
      let allProducts: any[] = [];
      let hasMore = true;

      while (hasMore) {
        console.log(`   ... fetching page ${page}`);
        
        const response = await dtone.getProducts({
          operator_id: operatorId,
          service_id: serviceId, 
          page: page,
          per_page: perPage,
          'Accept-Language': lang
        });
        
        const rawList = response.data || response;
        const list = (Array.isArray(rawList) ? rawList : ((rawList as any).payload || [])) as any[];

        if (list.length === 0) {
          hasMore = false;
        } else {
          allProducts = [...allProducts, ...list];
          if (list.length < perPage) hasMore = false;
          else page++;
        }
      }

      console.log(`[DTOne] ✅ Found ${allProducts.length} total products.`);

      const products: Product[] = allProducts.map(p => {
        const dest = p.destination || {};
        const source = p.source || {};
        const prices = p.prices || {}; 
        
        const isRanged = p.type?.includes('RANGE') || 
                         (dest.amount && typeof dest.amount === 'object' && dest.amount.min !== undefined);
        
        let amount = 'N/A';
        let min = 0;
        let max = 0;
        
        if (typeof dest.amount === 'number') {
          amount = `${dest.amount} ${dest.unit}`;
        } else if (dest.amount?.min !== undefined) {
          min = dest.amount.min;
          max = dest.amount.max || dest.amount.min;
          amount = `${min}-${max} ${dest.unit}`;
        }

        const benefits = p.benefits?.map((b: any) => b.type) || [];

        // 💰 PRICE CALCULATION LOGIC
        // Priority: 1. Wholesale * Margin -> 2. Source * Margin
        
        let costPrice: number | undefined;
        let costPriceMin: number | undefined;
        let costPriceMax: number | undefined;
        let costCurrency: string = prices.wholesale?.unit || source.unit || 'USD';
        
        // ❌ REMOVED: Retail Price Priority
        // We now rely on Wholesale + Margin
        
        // 1. Use WHOLESALE Price + MARGIN
        if (prices.wholesale?.amount) {
             if (typeof prices.wholesale.amount === 'number') {
                 // Fixed
                 costPrice = prices.wholesale.amount * FALLBACK_MARGIN;
             } else if (prices.wholesale.amount.min !== undefined) {
                 // Ranged
                 costPriceMin = prices.wholesale.amount.min * FALLBACK_MARGIN;
                 costPriceMax = (prices.wholesale.amount.max || prices.wholesale.amount.min) * FALLBACK_MARGIN;
                 costPrice = costPriceMin; 
             }
        } 
        
        // 2. Fallback to SOURCE Amount + MARGIN (If wholesale is missing)
        if (costPrice === undefined && costPriceMin === undefined) {
             if (typeof source.amount === 'number') {
                costPrice = source.amount * FALLBACK_MARGIN;
             } else if (source.amount?.min !== undefined) {
                costPriceMin = source.amount.min * FALLBACK_MARGIN;
                costPriceMax = (source.amount.max || source.amount.min) * FALLBACK_MARGIN;
                costPrice = costPriceMin;
             }
        }

        return {
          id: p.id,
          name: p.name,
          type: p.type,
          amount,
          currency: dest.unit,
          min,
          max,
          benefits,
          subserviceId: p.service?.subservice?.id,
          costPrice,
          costPriceMin,
          costPriceMax,
          costCurrency,
          isRanged
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
  async purchaseProduct(
    productId: number, 
    mobile: string, 
    amount: number, 
    unit?: string, 
    type?: string, 
    callbackUrl?: string
  ): Promise<ApiResponse<TransactionResult>> {
    
    const cleanMobile = formatMobileForDtOne(mobile);

    if (!validateMobileNumber(cleanMobile)) {
      return { success: false, error: 'Invalid mobile number (E.164 required)', code: 'INVALID_MOBILE' };
    }

    const externalId = generateTransactionId();
    console.log(`[DTOne] Purchasing Product ${productId} for ${cleanMobile} [Ref: ${externalId}]...`);

    try {
      const payload: any = {
        external_id: externalId,
        product_id: productId,
        credit_party_identifier: { mobile_number: cleanMobile }, 
        auto_confirm: true,
	      callback_url: callbackUrl
      };

      const isRanged = type === 'RANGED_VALUE_RECHARGE' || type === 'RANGED_VALUE_PIN';
      
      // ✅ Correct Calculation Mode for Ranged Products
      if (isRanged && amount > 0 && unit) {
        payload.calculation_mode = 'DESTINATION_AMOUNT';
        payload.destination = {
          unit_type: 'CURRENCY',
          unit: unit,
          amount: amount
        };
      }
      
      console.log("📤 [DTOne] Payload:", JSON.stringify(payload, null, 2));

      const response = await dtone.postTransactionSync(payload);
      const data = (response.data || response) as any;

      return {
        success: true,
        data: {
          id: data.id,
	        statusId: data.status?.class?.id,
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
    console.log(`[DTOne] ➡️  Operator: ${lookup.data?.operatorName}`);
    return await dtoneService.purchaseProduct(productId, mobile, amount, undefined, undefined); 
  },

  // ----------------------------------------
  // F. GET ALL OPERATORS
  // ----------------------------------------
  async getAllOperators(serviceId: number = 1): Promise<ApiResponse<any[]>> {
    console.log(`[DTOne] 🔄 Fetching ALL Operators (Service ${serviceId})...`);
    try {
      let page = 1;
      let allOperators: any[] = [];
      let hasMore = true;

      while (hasMore) {
        const response = await dtone.getOperators({
          service_id: serviceId,
          page: page,
          per_page: 100
        });

        const raw = response.data || response;
        const list = (Array.isArray(raw) ? raw : (raw.data || raw.payload || [])) as any[];

        if (list.length === 0) {
          hasMore = false;
        } else {
          const simplified = list.map(op => ({
            id: op.id,
            name: op.name,
            countryCode: op.country?.iso_code,
            regions: op.regions
          }));

          allOperators = [...allOperators, ...simplified];
          if (list.length < 100) hasMore = false;
          else page++;
        }
      }

      console.log(`[DTOne] ✅ Cached ${allOperators.length} operators.`);
      return { success: true, data: allOperators };

    } catch (error: any) {
      const err = handleApiError(error, 'Get Operators');
      return { success: false, error: err.error, code: err.code };
    }
  }
};
