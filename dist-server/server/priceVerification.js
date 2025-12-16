"use strict";
// server/priceVerification.ts
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.priceVerificationService = void 0;
var db_1 = require("./db");
var dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// ✅ FIX: Define the same margin used in Routes.ts
var FALLBACK_MARGIN = Number(process.env.DTONE_FALLBACK_MARGIN) || 1.15;
// ✅ FIX: Increased tolerance to 5% to handle rounding differences
var PRICE_TOLERANCE_PERCENT = 0.05;
// Global Min from Env
var GLOBAL_MIN_USD = Number(process.env.VITE_MIN_USD_ORDER || 0);
function getAdjustedMin(product) {
    var min = product.minAmount || 0;
    if (!product.type || !product.type.includes('RANGED')) {
        return product.amount || 0;
    }
    // If product currency is USD, ensure it meets global min
    if (product.currency === 'USD') {
        return Math.max(min, GLOBAL_MIN_USD);
    }
    // Calculate equivalent local currency min based on USD cost
    if (product.costPrice && product.costPrice > 0 && product.minAmount > 0) {
        var isCostUsd = !product.costCurrency || product.costCurrency === 'USD';
        if (isCostUsd) {
            var impliedRate = product.minAmount / product.costPrice;
            var minRequiredLocal = GLOBAL_MIN_USD * impliedRate;
            return Math.max(min, minRequiredLocal);
        }
    }
    return min;
}
exports.priceVerificationService = {
    getAdjustedMin: getAdjustedMin,
    verifyProductPrice: function (productId, paidAmount, paidCurrency) {
        return __awaiter(this, void 0, void 0, function () {
            var product, absoluteMinUsd, baseCost, expectedPrice, tolerance, priceDiff, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.product.findUnique({ where: { id: productId } })];
                    case 1:
                        product = _a.sent();
                        if (!product) {
                            console.log("[Price Check] Product ".concat(productId, " not in cache."));
                            return [2 /*return*/, {
                                    valid: true,
                                    error: 'Product not in cache - price verification skipped',
                                    code: 'CACHE_MISS'
                                }];
                        }
                        // ✅ FIX: Enforce USD Payment Currency (since we charge in USD)
                        if (paidCurrency.toUpperCase() !== 'USD') {
                            return [2 /*return*/, {
                                    valid: false,
                                    expectedCurrency: 'USD',
                                    error: "Currency mismatch: Paid ".concat(paidCurrency, ", expected USD"),
                                    code: 'CURRENCY_MISMATCH'
                                }];
                        }
                        // ---------------------------------------------------------
                        // CASE 1: RANGED PRODUCTS
                        // ---------------------------------------------------------
                        if (product.type.includes('RANGED')) {
                            absoluteMinUsd = GLOBAL_MIN_USD;
                            if (paidAmount < absoluteMinUsd) {
                                return [2 /*return*/, {
                                        valid: false,
                                        expectedPrice: absoluteMinUsd,
                                        expectedCurrency: 'USD',
                                        error: "Amount too low. Min: $".concat(absoluteMinUsd, " USD"),
                                        code: 'AMOUNT_TOO_LOW'
                                    }];
                            }
                            return [2 /*return*/, { valid: true, expectedPrice: paidAmount, expectedCurrency: 'USD' }];
                        }
                        baseCost = product.costPrice || product.amount || 0;
                        if (baseCost === 0) {
                            return [2 /*return*/, { valid: true, error: 'Product price not set', code: 'NO_PRICE' }];
                        }
                        expectedPrice = baseCost * FALLBACK_MARGIN;
                        tolerance = expectedPrice * PRICE_TOLERANCE_PERCENT;
                        priceDiff = Math.abs(paidAmount - expectedPrice);
                        if (priceDiff > tolerance) {
                            console.warn("[Price Check] \u274C Mismatch: Paid $".concat(paidAmount, ", Expected ~$").concat(expectedPrice.toFixed(2), " (Base: $").concat(baseCost, " * Margin: ").concat(FALLBACK_MARGIN, ")"));
                            // Allow overpayment (if profit is higher than expected), block underpayment
                            if (paidAmount < expectedPrice - tolerance) {
                                return [2 /*return*/, {
                                        valid: false,
                                        expectedPrice: expectedPrice,
                                        expectedCurrency: 'USD',
                                        error: "Underpaid: Paid $".concat(paidAmount, ", Expected ~$").concat(expectedPrice.toFixed(2)),
                                        code: 'PRICE_MISMATCH_LOW'
                                    }];
                            }
                        }
                        console.log("[Price Check] \u2705 Verified: Paid $".concat(paidAmount, " (Expected: ~$").concat(expectedPrice.toFixed(2), ")"));
                        return [2 /*return*/, { valid: true, expectedPrice: expectedPrice, expectedCurrency: 'USD' }];
                    case 2:
                        error_1 = _a.sent();
                        console.error('[Price Check] Error:', error_1);
                        return [2 /*return*/, { valid: false, error: 'Price verification failed', code: 'VERIFICATION_ERROR' }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    },
    getProductPrice: function (productId) {
        return __awaiter(this, void 0, void 0, function () {
            var product, adjustedMin, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, db_1.db.product.findUnique({ where: { id: productId } })];
                    case 1:
                        product = _a.sent();
                        if (!product) {
                            return [2 /*return*/, { success: false, error: 'Product not found' }];
                        }
                        adjustedMin = getAdjustedMin(product);
                        return [2 /*return*/, {
                                success: true,
                                price: product.amount || 0,
                                currency: product.currency,
                                min: adjustedMin,
                                max: product.maxAmount || undefined,
                                type: product.type
                            }];
                    case 2:
                        error_2 = _a.sent();
                        console.error('[Price Check] getProductPrice error:', error_2);
                        return [2 /*return*/, { success: false, error: 'Failed to get product price' }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    }
};
