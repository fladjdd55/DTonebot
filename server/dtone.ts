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

// Helper function to clean and format mobile number for DTOne (E.164)
function formatMobileForDtOne(mobile: string): string {
    // Remove spaces, dashes, and parentheses
    let cleanMobile = mobile.replace(/[\s\-\(\)]/g, '');
    
    // Ensure the '+' sign is present at the start
    if (!cleanMobile.startsWith('+')) {
      cleanMobile = `+${cleanMobile}`;
    }
    return cleanMobile;
}

// ✅ FIX: Update Validation Logic to strictly check for E.164
function validateMobileNumber(mobile: string): boolean {
  // Mobile is expected to be cleaned and start with '+'.
  // DTOne requires E.164 format: ^\+[1-9][0-9]{6,14}$
  return /^\+[1-9][0-9]{6,14}$/.test(mobile);
}

function generateTransactionId(): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substr(2, 9);
  return `txn_${timestamp}_${randomStr}`;
}

// ✅ FIX: Add deep logging to see full DTOne error details
function handleApiError(error: any, context: string): { error: string, code: string } {
  const msg = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown error';
  
  // Log the full API response body if available for debugging
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
    
    const cleanMobile = formatMobileForDtOne(mobile); // ✅ FIX: Format for E.164

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

        const benefits = p.benefits?.map((b: any) => b.type) || [];

        return {
          id: p.id,
          name: p.name,
          type: p.type,
          amount,
          currency: dest.unit,
          min: dest.amount?.min || 0,
          max: dest.amount?.max || 0,
          benefits: benefits,
          subserviceId: p.service?.subservice?.id 
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
    type?: string, // Added for correct RANGED product handling
    callbackUrl?: string
  ): Promise<ApiResponse<TransactionResult>> {
    
    const cleanMobile = formatMobileForDtOne(mobile); // ✅ FIX: Format for E.164

    if (!validateMobileNumber(cleanMobile)) {
      return { success: false, error: 'Invalid mobile number (E.164 required)', code: 'INVALID_MOBILE' };
    }

    const externalId = generateTransactionId();
    console.log(`[DTOne] Purchasing Product ${productId} for ${cleanMobile} [Ref: ${externalId}]...`);

    try {
      const payload: any = {
        external_id: externalId,
        product_id: productId,
        credit_party_identifier: { mobile_number: cleanMobile }, // Sending E.164
        auto_confirm: true,
	      callback_url: callbackUrl
      };

      // Check if this is a Ranged product
      const isRanged = type === 'RANGED_VALUE_RECHARGE' || type === 'RANGED_VALUE_PIN';
      
      // ✅ FIX: Only add destination for Ranged products if we have amount/unit
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
    // Note: The 'type' argument is intentionally omitted here as it's not needed for the simple topup flow.
    return await dtoneService.purchaseProduct(productId, mobile, amount, undefined, undefined); 
  },

  // ----------------------------------------
  // F. GET ALL OPERATORS (FOR CACHE)
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
          // Map to relevant fields to keep cache lightweight
          const simplified = list.map(op => ({
            id: op.id,
            name: op.name,
            countryCode: op.country?.iso_code,
            regions: op.regions
          }));

          allOperators = [...allOperators, ...simplified];
          
          if (list.length < 100) {
             hasMore = false;
          } else {
             page++;
          }
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
