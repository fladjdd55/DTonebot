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
console.log("🚀 Script started! If you see this, the file is running.");
var dotenv_1 = __importDefault(require("dotenv"));
var path_1 = __importDefault(require("path"));
var p_limit_1 = __importDefault(require("p-limit")); // Make sure this is installed: npm install p-limit
// Force load .env from the root directory
var envPath = path_1.default.resolve(__dirname, '../../.env');
console.log("\uD83D\uDCC2 Loading .env from: ".concat(envPath));
dotenv_1.default.config({ path: envPath });
var db_1 = require("../db");
var dtone_1 = require("../dtone");
// ⚡ CONFIGURATION
var CONCURRENCY = 10; // Number of operators to fetch in parallel
function syncProducts() {
    return __awaiter(this, void 0, void 0, function () {
        var key, currentCount, operatorsRes, opList_1, limit_1, processedOps_1, productsSaved_1, tasks, error_1;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('\n==================================================');
                    console.log('📦 [Sync] Starting Product Catalog Refresh');
                    console.log('==================================================');
                    key = process.env.DTONE_API_KEY;
                    if (!key) {
                        console.error('❌ FATAL: DTONE_API_KEY is missing in process.env');
                        return [2 /*return*/];
                    }
                    console.log("\uD83D\uDD11 API Key loaded: ".concat(key.substring(0, 4), "..."));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, 6, 7]);
                    // 2. Connect to DB
                    console.log('🗄️  Connecting to Database...');
                    return [4 /*yield*/, db_1.db.product.count()];
                case 2:
                    currentCount = _a.sent();
                    console.log("   (Current products in DB: ".concat(currentCount, ")"));
                    // 3. Fetch Operators
                    console.log('📡 Connecting to DTOne to fetch operators...');
                    return [4 /*yield*/, dtone_1.dtoneService.getAllOperators()];
                case 3:
                    operatorsRes = _a.sent();
                    if (!operatorsRes.success || !operatorsRes.data) {
                        console.error('❌ Failed to get operators. API Response:', operatorsRes.error);
                        return [2 /*return*/];
                    }
                    opList_1 = operatorsRes.data;
                    console.log("\u2705 Found ".concat(opList_1.length, " operators."));
                    if (opList_1.length === 0) {
                        console.warn('⚠️ No operators found. Check your API credentials or Service ID.');
                        return [2 /*return*/];
                    }
                    // 4. Parallel Processing Setup
                    console.log("\uD83D\uDD04 Fetching products for ".concat(opList_1.length, " operators (Concurrency: ").concat(CONCURRENCY, ")..."));
                    limit_1 = (0, p_limit_1.default)(CONCURRENCY);
                    processedOps_1 = 0;
                    productsSaved_1 = 0;
                    tasks = opList_1.map(function (op) {
                        return limit_1(function () { return __awaiter(_this, void 0, void 0, function () {
                            var apiRes, upsertPromises, err_1;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        _a.trys.push([0, 4, 5, 6]);
                                        return [4 /*yield*/, dtone_1.dtoneService.getProductsForOperator(op.id, 1, 100, 'en')];
                                    case 1:
                                        apiRes = _a.sent();
                                        if (!(apiRes.success && apiRes.data && apiRes.data.length > 0)) return [3 /*break*/, 3];
                                        upsertPromises = apiRes.data.map(function (p) {
                                            var fixedAmount = p.amount && p.amount !== 'N/A' ? parseFloat(p.amount.split(' ')[0]) : 0;
                                            return db_1.db.product.upsert({
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
                                                    serviceId: p.subserviceId || 1, // Default to 1 if missing
                                                    operatorId: op.id,
                                                    currency: p.currency,
                                                    amount: fixedAmount,
                                                    minAmount: p.min,
                                                    maxAmount: p.max
                                                }
                                            });
                                        });
                                        // Wait for DB writes for this operator
                                        return [4 /*yield*/, Promise.all(upsertPromises)];
                                    case 2:
                                        // Wait for DB writes for this operator
                                        _a.sent();
                                        productsSaved_1 += apiRes.data.length;
                                        _a.label = 3;
                                    case 3: return [3 /*break*/, 6];
                                    case 4:
                                        err_1 = _a.sent();
                                        console.error("\u274C Error fetching Op ".concat(op.id, ":"), err_1);
                                        return [3 /*break*/, 6];
                                    case 5:
                                        processedOps_1++;
                                        if (processedOps_1 % 10 === 0 || processedOps_1 === opList_1.length) {
                                            console.log("   \uD83D\uDCDD Progress: ".concat(processedOps_1, "/").concat(opList_1.length, " operators checked."));
                                        }
                                        return [7 /*endfinally*/];
                                    case 6: return [2 /*return*/];
                                }
                            });
                        }); });
                    });
                    // 5. Execute all tasks
                    return [4 /*yield*/, Promise.all(tasks)];
                case 4:
                    // 5. Execute all tasks
                    _a.sent();
                    console.log("\n\n\u2705 [Success] Sync Complete!");
                    console.log("   - Operators Processed: ".concat(processedOps_1));
                    console.log("   - Products Saved in DB: ".concat(productsSaved_1));
                    console.log('==================================================\n');
                    return [3 /*break*/, 7];
                case 5:
                    error_1 = _a.sent();
                    console.error('\n❌ [Sync] Script Crashed:', error_1);
                    return [3 /*break*/, 7];
                case 6: return [7 /*endfinally*/];
                case 7: return [2 /*return*/];
            }
        });
    });
}
// 🔥 EXECUTE IMMEDIATELY
syncProducts();
