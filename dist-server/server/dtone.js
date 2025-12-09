"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dtoneService = void 0;
// @ts-ignore
var dtone_1 = __importDefault(require("@api/dtone"));
var dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// ==========================================
// 1. CONFIGURATION
// ==========================================
var DTONE_API_KEY = process.env.DTONE_API_KEY;
var DTONE_API_SECRET = process.env.DTONE_API_SECRET;
var DTONE_MODE = process.env.DTONE_MODE || 'sandbox';
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
// Helper function to clean and format mobile number for DTOne (E.164)
function formatMobileForDtOne(mobile) {
    // Remove spaces, dashes, and parentheses
    var cleanMobile = mobile.replace(/[\s\-\(\)]/g, '');
    // Ensure the '+' sign is present at the start
    if (!cleanMobile.startsWith('+')) {
        cleanMobile = "+".concat(cleanMobile);
    }
    return cleanMobile;
}
// ✅ FIX: Update Validation Logic to strictly check for E.164
function validateMobileNumber(mobile) {
    // Mobile is expected to be cleaned and start with '+'.
    // DTOne requires E.164 format: ^\+[1-9][0-9]{6,14}$
    return /^\+[1-9][0-9]{6,14}$/.test(mobile);
}
function generateTransactionId() {
    var timestamp = Date.now();
    var randomStr = Math.random().toString(36).substr(2, 9);
    return "txn_".concat(timestamp, "_").concat(randomStr);
}
// ✅ FIX: Add deep logging to see full DTOne error details
function handleApiError(error, context) {
    var _a, _b, _c, _d, _e, _f, _g;
    var msg = ((_d = (_c = (_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.errors) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) || error.message || 'Unknown error';
    // Log the full API response body if available for debugging
    if ((_e = error.response) === null || _e === void 0 ? void 0 : _e.data) {
        console.error("\u274C [DTOne ".concat(context, "] Full API Error Response:"), JSON.stringify(error.response.data, null, 2));
    }
    else {
        console.error("\u274C [DTOne ".concat(context, "] Error:"), error.message);
    }
    if (error.status === 401 || ((_f = error.response) === null || _f === void 0 ? void 0 : _f.status) === 401) {
        console.error('[DTOne] ❌ AUTH ERROR: Check Credentials');
        return { error: 'Authentication failed', code: 'AUTH_ERROR' };
    }
    console.error("[DTOne] ".concat(context, " Failed: ").concat(msg));
    if (error.status === 422 || ((_g = error.response) === null || _g === void 0 ? void 0 : _g.status) === 422) {
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
    getCountries: function () {
        return __awaiter(this, arguments, void 0, function (serviceId) {
            var page, allCountries, hasMore, response, raw, list, _i, list_1, c, iso, error_1, err;
            if (serviceId === void 0) { serviceId = 1; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!serviceId || serviceId <= 0) {
                            return [2 /*return*/, { success: false, error: 'Invalid service ID', code: 'INVALID_SERVICE_ID' }];
                        }
                        console.log("[DTOne] Fetching Countries for Service ".concat(serviceId, "..."));
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 6]);
                        page = 1;
                        allCountries = [];
                        hasMore = true;
                        _a.label = 2;
                    case 2:
                        if (!hasMore) return [3 /*break*/, 4];
                        return [4 /*yield*/, dtone_1.default.getCountries({
                                service_id: serviceId,
                                page: page,
                                per_page: 100
                            })];
                    case 3:
                        response = _a.sent();
                        raw = response.data || response;
                        list = (Array.isArray(raw) ? raw : (raw.data || raw.payload || []));
                        if (list.length === 0) {
                            hasMore = false;
                        }
                        else {
                            for (_i = 0, list_1 = list; _i < list_1.length; _i++) {
                                c = list_1[_i];
                                iso = c.iso_code || c.isoCode;
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
                        return [3 /*break*/, 2];
                    case 4:
                        allCountries.sort(function (a, b) { return a.name.localeCompare(b.name); });
                        return [2 /*return*/, { success: true, data: allCountries }];
                    case 5:
                        error_1 = _a.sent();
                        err = handleApiError(error_1, 'Get Countries');
                        return [2 /*return*/, { success: false, error: err.error, code: err.code }];
                    case 6: return [2 /*return*/];
                }
            });
        });
    },
    // ----------------------------------------
    // B. LOOKUP MOBILE NUMBER
    // ----------------------------------------
    lookupMobileNumber: function (mobile) {
        return __awaiter(this, void 0, void 0, function () {
            var cleanMobile, response, result, match, error_2, err;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        cleanMobile = formatMobileForDtOne(mobile);
                        console.log("[DTOne] Looking up operator for: ".concat(cleanMobile));
                        if (!validateMobileNumber(cleanMobile)) {
                            return [2 /*return*/, { success: false, error: 'Invalid mobile format (E.164 required)', code: 'INVALID_MOBILE' }];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, dtone_1.default.postLookupMobileNumber({ mobile_number: cleanMobile })];
                    case 2:
                        response = _b.sent();
                        result = response.data || response;
                        match = (Array.isArray(result) ? result[0] : result);
                        if (match && match.identified) {
                            return [2 /*return*/, {
                                    success: true,
                                    data: {
                                        operatorId: match.id,
                                        operatorName: match.name,
                                        countryIso: ((_a = match.country) === null || _a === void 0 ? void 0 : _a.iso_code) || 'Unknown',
                                        identified: true
                                    }
                                }];
                        }
                        return [2 /*return*/, { success: false, error: 'Operator not found', code: 'OPERATOR_NOT_FOUND' }];
                    case 3:
                        error_2 = _b.sent();
                        err = handleApiError(error_2, 'Lookup');
                        return [2 /*return*/, { success: false, error: err.error, code: err.code }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    },
    // ----------------------------------------
    // C. GET PRODUCTS
    // ----------------------------------------
    getProductsForOperator: function (operatorId_1) {
        return __awaiter(this, arguments, void 0, function (operatorId, serviceId, perPage) {
            var response, rawList, list, products, error_3, err;
            if (serviceId === void 0) { serviceId = 1; }
            if (perPage === void 0) { perPage = 50; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[DTOne] Fetching Products: Op=".concat(operatorId, ", Svc=").concat(serviceId));
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, dtone_1.default.getProducts({
                                operator_id: operatorId,
                                service_id: serviceId,
                                per_page: perPage
                            })];
                    case 2:
                        response = _a.sent();
                        rawList = response.data || response;
                        list = (Array.isArray(rawList) ? rawList : (rawList.payload || []));
                        products = list.map(function (p) {
                            var _a, _b, _c, _d, _e, _f;
                            var dest = p.destination || {};
                            var amount = 'N/A';
                            if (typeof dest.amount === 'number') {
                                amount = "".concat(dest.amount, " ").concat(dest.unit);
                            }
                            else if ((_a = dest.amount) === null || _a === void 0 ? void 0 : _a.min) {
                                amount = "".concat(dest.amount.min, "-").concat(dest.amount.max, " ").concat(dest.unit);
                            }
                            var benefits = ((_b = p.benefits) === null || _b === void 0 ? void 0 : _b.map(function (b) { return b.type; })) || [];
                            return {
                                id: p.id,
                                name: p.name,
                                type: p.type,
                                amount: amount,
                                currency: dest.unit,
                                min: ((_c = dest.amount) === null || _c === void 0 ? void 0 : _c.min) || 0,
                                max: ((_d = dest.amount) === null || _d === void 0 ? void 0 : _d.max) || 0,
                                benefits: benefits,
                                subserviceId: (_f = (_e = p.service) === null || _e === void 0 ? void 0 : _e.subservice) === null || _f === void 0 ? void 0 : _f.id
                            };
                        });
                        return [2 /*return*/, { success: true, data: products }];
                    case 3:
                        error_3 = _a.sent();
                        err = handleApiError(error_3, 'Get Products');
                        return [2 /*return*/, { success: false, error: err.error, code: err.code }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    },
    // ----------------------------------------
    // D. PURCHASE
    // ----------------------------------------
    purchaseProduct: function (productId, mobile, amount, unit, type, // Added for correct RANGED product handling
    callbackUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var cleanMobile, externalId, payload, isRanged, response, data, error_4, err;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        cleanMobile = formatMobileForDtOne(mobile);
                        if (!validateMobileNumber(cleanMobile)) {
                            return [2 /*return*/, { success: false, error: 'Invalid mobile number (E.164 required)', code: 'INVALID_MOBILE' }];
                        }
                        externalId = generateTransactionId();
                        console.log("[DTOne] Purchasing Product ".concat(productId, " for ").concat(cleanMobile, " [Ref: ").concat(externalId, "]..."));
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 3, , 4]);
                        payload = {
                            external_id: externalId,
                            product_id: productId,
                            credit_party_identifier: { mobile_number: cleanMobile }, // Sending E.164
                            auto_confirm: true,
                            callback_url: callbackUrl
                        };
                        isRanged = type === 'RANGED_VALUE_RECHARGE' || type === 'RANGED_VALUE_PIN';
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
                        return [4 /*yield*/, dtone_1.default.postTransactionSync(payload)];
                    case 2:
                        response = _e.sent();
                        data = (response.data || response);
                        return [2 /*return*/, {
                                success: true,
                                data: {
                                    id: data.id,
                                    statusId: (_b = (_a = data.status) === null || _a === void 0 ? void 0 : _a.class) === null || _b === void 0 ? void 0 : _b.id,
                                    status: ((_c = data.status) === null || _c === void 0 ? void 0 : _c.message) || data.status,
                                    externalId: data.external_id,
                                    message: (_d = data.status) === null || _d === void 0 ? void 0 : _d.message
                                }
                            }];
                    case 3:
                        error_4 = _e.sent();
                        err = handleApiError(error_4, 'Transaction');
                        return [2 /*return*/, { success: false, error: err.error, code: err.code }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    },
    // ----------------------------------------
    // E. ONE-LINE TOPUP
    // ----------------------------------------
    purchaseTopup: function (mobile_1, productId_1) {
        return __awaiter(this, arguments, void 0, function (mobile, productId, amount) {
            var lookup;
            var _a;
            if (amount === void 0) { amount = 0; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        console.log("[DTOne] \uD83D\uDD04 Auto-Topup started for ".concat(mobile));
                        return [4 /*yield*/, exports.dtoneService.lookupMobileNumber(mobile)];
                    case 1:
                        lookup = _b.sent();
                        if (!lookup.success)
                            return [2 /*return*/, lookup];
                        console.log("[DTOne] \u27A1\uFE0F  Operator: ".concat((_a = lookup.data) === null || _a === void 0 ? void 0 : _a.operatorName));
                        return [4 /*yield*/, exports.dtoneService.purchaseProduct(productId, mobile, amount, undefined, undefined)];
                    case 2: 
                    // Note: The 'type' argument is intentionally omitted here as it's not needed for the simple topup flow.
                    return [2 /*return*/, _b.sent()];
                }
            });
        });
    },
    // ----------------------------------------
    // F. GET ALL OPERATORS (FOR CACHE)
    // ----------------------------------------
    getAllOperators: function () {
        return __awaiter(this, arguments, void 0, function (serviceId) {
            var page, allOperators, hasMore, response, raw, list, simplified, error_5, err;
            if (serviceId === void 0) { serviceId = 1; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[DTOne] \uD83D\uDD04 Fetching ALL Operators (Service ".concat(serviceId, ")..."));
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 6]);
                        page = 1;
                        allOperators = [];
                        hasMore = true;
                        _a.label = 2;
                    case 2:
                        if (!hasMore) return [3 /*break*/, 4];
                        return [4 /*yield*/, dtone_1.default.getOperators({
                                service_id: serviceId,
                                page: page,
                                per_page: 100
                            })];
                    case 3:
                        response = _a.sent();
                        raw = response.data || response;
                        list = (Array.isArray(raw) ? raw : (raw.data || raw.payload || []));
                        if (list.length === 0) {
                            hasMore = false;
                        }
                        else {
                            simplified = list.map(function (op) {
                                var _a;
                                return ({
                                    id: op.id,
                                    name: op.name,
                                    countryCode: (_a = op.country) === null || _a === void 0 ? void 0 : _a.iso_code,
                                    regions: op.regions
                                });
                            });
                            allOperators = __spreadArray(__spreadArray([], allOperators, true), simplified, true);
                            if (list.length < 100) {
                                hasMore = false;
                            }
                            else {
                                page++;
                            }
                        }
                        return [3 /*break*/, 2];
                    case 4:
                        console.log("[DTOne] \u2705 Cached ".concat(allOperators.length, " operators."));
                        return [2 /*return*/, { success: true, data: allOperators }];
                    case 5:
                        error_5 = _a.sent();
                        err = handleApiError(error_5, 'Get Operators');
                        return [2 /*return*/, { success: false, error: err.error, code: err.code }];
                    case 6: return [2 /*return*/];
                }
            });
        });
    }
};
