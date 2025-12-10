"use strict";
// server/scripts/sync-products.ts
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
exports.syncProducts = syncProducts;
// 1. Force load .env immediately (Critical for scripts)
var dotenv_1 = __importDefault(require("dotenv"));
var path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../.env') });
var db_1 = require("../db");
var dtone_1 = require("../dtone");
function syncProducts() {
    return __awaiter(this, void 0, void 0, function () {
        var key, operators, opList, productCount, operatorCount, _i, opList_1, op, apiRes, _a, _b, p, fixedAmount, error_1;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    console.log('\n==================================================');
                    console.log('📦 [Sync] Starting Product Catalog Refresh');
                    console.log('==================================================');
                    key = process.env.DTONE_API_KEY;
                    if (!key) {
                        console.error('❌ FATAL: DTONE_API_KEY is missing in process.env');
                        console.error('   Make sure you have a .env file in the root directory.');
                        return [2 /*return*/];
                    }
                    console.log("\uD83D\uDD11 API Key loaded: ".concat(key.substring(0, 4), "..."));
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 10, , 11]);
                    // 2. Get all operators
                    console.log('📡 Connecting to DTOne to fetch operators...');
                    return [4 /*yield*/, dtone_1.dtoneService.getAllOperators()];
                case 2:
                    operators = _c.sent();
                    if (!operators.success || !operators.data) {
                        console.error('❌ Failed to get operators. API Response:', operators.error);
                        return [2 /*return*/];
                    }
                    opList = operators.data;
                    console.log("\u2705 Found ".concat(opList.length, " operators."));
                    if (opList.length === 0) {
                        console.warn('⚠️ No operators found. Check your API credentials or Service ID.');
                        return [2 /*return*/];
                    }
                    productCount = 0;
                    operatorCount = 0;
                    // 3. Loop through operators
                    console.log('🔄 Fetching products for each operator (this may take a moment)...');
                    _i = 0, opList_1 = opList;
                    _c.label = 3;
                case 3:
                    if (!(_i < opList_1.length)) return [3 /*break*/, 9];
                    op = opList_1[_i];
                    operatorCount++;
                    // Progress bar effect
                    process.stdout.write("\r   Processing Op ".concat(operatorCount, "/").concat(opList.length, " (ID: ").concat(op.id, ")..."));
                    return [4 /*yield*/, dtone_1.dtoneService.getProductsForOperator(op.id, 1, 100, 'en')];
                case 4:
                    apiRes = _c.sent();
                    if (!(apiRes.success && apiRes.data && apiRes.data.length > 0)) return [3 /*break*/, 8];
                    _a = 0, _b = apiRes.data;
                    _c.label = 5;
                case 5:
                    if (!(_a < _b.length)) return [3 /*break*/, 8];
                    p = _b[_a];
                    fixedAmount = p.amount && p.amount !== 'N/A' ? parseFloat(p.amount.split(' ')[0]) : 0;
                    return [4 /*yield*/, db_1.db.product.upsert({
                            where: { id: p.id },
                            update: {
                                name: p.name,
                                amount: fixedAmount,
                                minAmount: p.min,
                                maxAmount: p.max,
                                updatedAt: new Date()
                            },
                            create: {
                                id: p.id,
                                name: p.name,
                                type: p.type,
                                serviceId: p.subserviceId || 1,
                                operatorId: op.id,
                                currency: p.currency,
                                amount: fixedAmount,
                                minAmount: p.min,
                                maxAmount: p.max
                            }
                        })];
                case 6:
                    _c.sent();
                    productCount++;
                    _c.label = 7;
                case 7:
                    _a++;
                    return [3 /*break*/, 5];
                case 8:
                    _i++;
                    return [3 /*break*/, 3];
                case 9:
                    console.log("\n\n\u2705 [Success] Sync Complete!");
                    console.log("   - Operators Processed: ".concat(operatorCount));
                    console.log("   - Products Saved in DB: ".concat(productCount));
                    console.log('==================================================\n');
                    return [3 /*break*/, 11];
                case 10:
                    error_1 = _c.sent();
                    console.error('\n❌ [Sync] Script Crashed:', error_1.message);
                    return [3 /*break*/, 11];
                case 11: return [2 /*return*/];
            }
        });
    });
}
// Allow running directly: npx ts-node server/scripts/sync-products.ts
if (require.main === module) {
    syncProducts();
}
