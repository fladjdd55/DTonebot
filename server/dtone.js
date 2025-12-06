"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dtoneService = void 0;
// @ts-ignore
const dtone_1 = __importDefault(require("@api/dtone"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// ==========================================
// 1. CONFIGURATION
// ==========================================
const DTONE_API_KEY = process.env.DTONE_API_KEY;
const DTONE_API_SECRET = process.env.DTONE_API_SECRET;
const DTONE_MODE = process.env.DTONE_MODE || 'sandbox';
if (!DTONE_API_KEY || !DTONE_API_SECRET) {
    throw new Error('FATAL: Missing DTOne credentials in .env file');
}
dtone_1.default.auth(DTONE_API_KEY, DTONE_API_SECRET);
if (DTONE_MODE === 'production') {
    console.log('[DTOne] 🚀 Mode: PRODUCTION');
    dtone_1.default.server('https://dvs-api.dtone.com/v1');
}
else {
    console.log('[DTOne] 🧪 Mode: SANDBOX');
    dtone_1.default.server('https://preprod-dvs-api.dtone.com/v1');
}
// ==========================================
// 2. UTILITY FUNCTIONS
// ==========================================
function validateMobileNumber(mobile) {
    const cleanNumber = mobile.replace(/[\s-]/g, '');
    return /^\+?[1-9]\d{1,14}$/.test(cleanNumber);
}
function generateTransactionId() {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 9);
    return `txn_${timestamp}_${randomStr}`;
}
function handleApiError(error, context) {
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
exports.dtoneService = {
    // ----------------------------------------
    // A. GET COUNTRIES
    // ----------------------------------------
    async getCountries(serviceId = 1) {
        if (!serviceId || serviceId <= 0) {
            return { success: false, error: 'Invalid service ID', code: 'INVALID_SERVICE_ID' };
        }
        console.log(`[DTOne] Fetching Countries for Service ${serviceId}...`);
        try {
            let page = 1;
            let allCountries = [];
            let hasMore = true;
            while (hasMore) {
                const response = await dtone_1.default.getCountries({
                    service_id: serviceId,
                    page: page,
                    per_page: 100
                });
                const raw = response.data || response;
                const list = (Array.isArray(raw) ? raw : (raw.data || raw.payload || []));
                if (list.length === 0) {
                    hasMore = false;
                }
                else {
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
                    }
                    else {
                        page++;
                    }
                }
            }
            allCountries.sort((a, b) => a.name.localeCompare(b.name));
            return { success: true, data: allCountries };
        }
        catch (error) {
            const err = handleApiError(error, 'Get Countries');
            return { success: false, error: err.error, code: err.code };
        }
    },
    // ----------------------------------------
    // B. LOOKUP MOBILE NUMBER
    // ----------------------------------------
    async lookupMobileNumber(mobile) {
        const cleanMobile = mobile.replace(/[\s-]/g, '');
        if (!validateMobileNumber(cleanMobile)) {
            return { success: false, error: 'Invalid format', code: 'INVALID_MOBILE' };
        }
        try {
            const response = await dtone_1.default.postLookupMobileNumber({ mobile_number: cleanMobile });
            const result = response.data || response;
            const match = (Array.isArray(result) ? result[0] : result);
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
        }
        catch (error) {
            const err = handleApiError(error, 'Lookup');
            return { success: false, error: err.error, code: err.code };
        }
    },
    // ----------------------------------------
    // C. GET PRODUCTS
    // ----------------------------------------
    async getProductsForOperator(operatorId, serviceId = 1, perPage = 50) {
        console.log(`[DTOne] Fetching Products: Op=${operatorId}, Svc=${serviceId}`);
        try {
            const response = await dtone_1.default.getProducts({
                operator_id: operatorId,
                service_id: serviceId,
                per_page: perPage
            });
            const rawList = response.data || response;
            const list = (Array.isArray(rawList) ? rawList : (rawList.payload || []));
            const products = list.map(p => {
                const dest = p.destination || {};
                let amount = 'N/A';
                if (typeof dest.amount === 'number') {
                    amount = `${dest.amount} ${dest.unit}`;
                }
                else if (dest.amount?.min) {
                    amount = `${dest.amount.min}-${dest.amount.max} ${dest.unit}`;
                }
                const benefits = p.benefits?.map((b) => b.type) || [];
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
        }
        catch (error) {
            const err = handleApiError(error, 'Get Products');
            return { success: false, error: err.error, code: err.code };
        }
    },
    // ----------------------------------------
    // D. PURCHASE
    // ----------------------------------------
    async purchaseProduct(productId, mobile, amount, unit) {
        const cleanMobile = mobile.replace(/[\s-]/g, '');
        if (!validateMobileNumber(cleanMobile)) {
            return { success: false, error: 'Invalid mobile number', code: 'INVALID_MOBILE' };
        }
        const externalId = generateTransactionId();
        console.log(`[DTOne] Purchasing Product ${productId} [Ref: ${externalId}]...`);
        try {
            const payload = {
                external_id: externalId,
                product_id: productId,
                credit_party_identifier: { mobile_number: cleanMobile },
                auto_confirm: true
            };
            // Strict requirement: Only send destination/calculation_mode for Ranged Products
            if (amount > 0) {
                if (!unit) {
                    return { success: false, error: 'Currency unit required for custom amounts', code: 'MISSING_UNIT' };
                }
                payload.calculation_mode = 'DESTINATION_AMOUNT';
                payload.destination = {
                    unit_type: 'CURRENCY',
                    unit: unit,
                    amount: amount
                };
            }
            const response = await dtone_1.default.postTransactionSync(payload);
            const data = (response.data || response);
            return {
                success: true,
                data: {
                    id: data.id,
                    status: data.status?.message || data.status,
                    externalId: data.external_id,
                    message: data.status?.message
                }
            };
        }
        catch (error) {
            const err = handleApiError(error, 'Transaction');
            return { success: false, error: err.error, code: err.code };
        }
    },
    // ----------------------------------------
    // E. ONE-LINE TOPUP
    // ----------------------------------------
    async purchaseTopup(mobile, productId, amount = 0) {
        console.log(`[DTOne] 🔄 Auto-Topup started for ${mobile}`);
        const lookup = await exports.dtoneService.lookupMobileNumber(mobile);
        if (!lookup.success)
            return lookup;
        console.log(`[DTOne] ➡️  Operator: ${lookup.data?.operatorName}`);
        return await exports.dtoneService.purchaseProduct(productId, mobile, amount);
    },
    // ----------------------------------------
    // F. GET ALL OPERATORS (FOR CACHE)
    // ----------------------------------------
    async getAllOperators(serviceId = 1) {
        console.log(`[DTOne] 🔄 Fetching ALL Operators (Service ${serviceId})...`);
        try {
            let page = 1;
            let allOperators = [];
            let hasMore = true;
            while (hasMore) {
                const response = await dtone_1.default.getOperators({
                    service_id: serviceId,
                    page: page,
                    per_page: 100
                });
                const raw = response.data || response;
                const list = (Array.isArray(raw) ? raw : (raw.data || raw.payload || []));
                if (list.length === 0) {
                    hasMore = false;
                }
                else {
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
                    }
                    else {
                        page++;
                    }
                }
            }
            console.log(`[DTOne] ✅ Cached ${allOperators.length} operators.`);
            return { success: true, data: allOperators };
        }
        catch (error) {
            const err = handleApiError(error, 'Get Operators');
            return { success: false, error: err.error, code: err.code };
        }
    }
};
