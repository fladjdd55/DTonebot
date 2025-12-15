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
// ✅ FIX: Force IPv4 to prevent network hangs
var node_dns_1 = __importDefault(require("node:dns"));
if (node_dns_1.default.setDefaultResultOrder) {
    node_dns_1.default.setDefaultResultOrder('ipv4first');
}
console.log("🚀 Script started! If you see this, the file is running.");
var dotenv_1 = __importDefault(require("dotenv"));
var path_1 = __importDefault(require("path"));
var p_limit_1 = __importDefault(require("p-limit"));
// Force load .env from the root directory
var envPath = path_1.default.resolve(__dirname, '../../.env');
console.log("\uD83D\uDCC2 Loading .env from: ".concat(envPath));
dotenv_1.default.config({ path: envPath });
var db_1 = require("../db");
var dtone_1 = require("../dtone");
// ⚡ CONFIGURATION (SAFE MODE)
var CONCURRENCY = 1; // Process 1 operator at a time to respect limits
var RATE_LIMIT_DELAY = 1000; // Wait 1 second between operators
var RETRY_DELAY = 10000; // Wait 10 seconds if we hit a 429 Error
// Helper: Sleep function
var sleep = function (ms) { return new Promise(function (r) { return setTimeout(r, ms); }); };
function syncProducts() {
    return __awaiter(this, void 0, void 0, function () {
        var key, currentCount, opList, attempts, res, limit_1, processedOps, productsSaved, tasks, results;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('\n==================================================');
                    console.log('📦 [Sync] Starting Product Catalog Refresh (Safe Mode)');
                    console.log('==================================================');
                    key = process.env.DTONE_API_KEY;
                    if (!key) {
                        console.error('❌ FATAL: DTONE_API_KEY is missing in process.env');
                        return [2 /*return*/];
                    }
                    console.log("\uD83D\uDD11 API Key loaded: ".concat(key.substring(0, 4), "..."));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, , 10, 11]);
                    // 2. Connect to DB
                    console.log('🗄️  Connecting to Database...');
                    return [4 /*yield*/, db_1.db.product.count()];
                case 2:
                    currentCount = _a.sent();
                    console.log("   (Current products in DB: ".concat(currentCount, ")"));
                    // 3. Fetch Operators
                    console.log('📡 Connecting to DTOne to fetch operators...');
                    opList = [];
                    attempts = 0;
                    _a.label = 3;
                case 3:
                    if (!(attempts < 3 && opList.length === 0)) return [3 /*break*/, 8];
                    attempts++;
                    return [4 /*yield*/, dtone_1.dtoneService.getAllOperators()];
                case 4:
                    res = _a.sent();
                    if (!(res.success && res.data)) return [3 /*break*/, 5];
                    opList = res.data;
                    return [3 /*break*/, 7];
                case 5:
                    console.warn("\u26A0\uFE0F  Failed to fetch operators (Attempt ".concat(attempts, "). Retrying in 3s..."));
                    return [4 /*yield*/, sleep(3000)];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7: return [3 /*break*/, 3];
                case 8:
                    if (opList.length === 0) {
                        console.error('❌ Failed to get operators. Aborting.');
                        return [2 /*return*/];
                    }
                    console.log("\u2705 Found ".concat(opList.length, " operators."));
                    // 4. Process Operators (Sequential Safe Mode)
                    console.log("\uD83D\uDD04 Fetching products for ".concat(opList.length, " operators..."));
                    limit_1 = (0, p_limit_1.default)(CONCURRENCY);
                    processedOps = 0;
                    productsSaved = 0;
                    tasks = opList.map(function (op) {
                        return limit_1(function () { return __awaiter(_this, void 0, void 0, function () {
                            var opSuccess, opRetries, apiRes, upsertPromises;
                            var _a;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        opSuccess = false;
                                        opRetries = 0;
                                        _b.label = 1;
                                    case 1:
                                        if (!(!opSuccess && opRetries < 3)) return [3 /*break*/, 8];
                                        _b.label = 2;
                                    case 2:
                                        _b.trys.push([2, , 6, 7]);
                                        return [4 /*yield*/, dtone_1.dtoneService.getProductsForOperator(op.id, 1, 100, 'en')];
                                    case 3:
                                        apiRes = _b.sent();
                                        if (!(!apiRes.success && (((_a = apiRes.error) === null || _a === void 0 ? void 0 : _a.includes('Too Many Requests')) || apiRes.code === '429'))) return [3 /*break*/, 5];
                                        opRetries++;
                                        console.warn("\u23F3 Rate Limit Hit on Op ".concat(op.id, ". Pausing ").concat(RETRY_DELAY / 1000, "s..."));
                                        return [4 /*yield*/, sleep(RETRY_DELAY)];
                                    case 4:
                                        _b.sent();
                                        return [3 /*break*/, 1]; // Retry loop
                                    case 5:
                                        // CASE 2: Other Error
                                        if (!apiRes.success) {
                                            opSuccess = true; // Treat as "done" so we don't retry forever on 404s
                                            return [3 /*break*/, 8];
                                        }
                                        // CASE 3: Success
                                        if (apiRes.data && apiRes.data.length > 0) {
                                            upsertPromises = apiRes.data.map(function (p) {
                                                var fixedAmount = p.amount && p.amount !== 'N/A' ? parseFloat(p.amount.split(' ')[0]) : 0;
                                                return db_1.db.product.upsert({
                                                    where: { id: p.id },
                                                    update: {
                                                        name: p.name,
                                                        amount: fixedAmount,
                                                        minAmount: p.min,
                                                        maxAmount: p.max,
                                                        serviceId: p.subserviceId || 1,
                                                        costPrice: p.costPrice || null,
                                                        costPriceMin: p.costPriceMin || null,
                                                        costPriceMax: p.costPriceMax || null,
                                                        costCurrency: p.costCurrency || 'USD',
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
                                                    } || null,
                                                    maxAmount: p.max,
                                                } || null, 
                                                // ✅ NEW: Save cost price
                                                costPrice, p.costPrice || null, costPriceMin, p.costPriceMin || null, costPriceMax, p.costPriceMax || null, costCurrency, p.costCurrency || 'USD');
                                            });
                                        }
                                        return [3 /*break*/, 7];
                                    case 6: return [7 /*endfinally*/];
                                    case 7: return [3 /*break*/, 1];
                                    case 8: return [2 /*return*/];
                                }
                            });
                        }); }).catch(function (err) {
                            console.error("   \u274C Failed to save product ".concat(p.id, ":"), err.message);
                            return null;
                        });
                    });
                    return [4 /*yield*/, Promise.all(upsertPromises)];
                case 9:
                    results = _a.sent();
                    productsSaved += results.filter(function (r) { return r !== null; }).length;
                    return [3 /*break*/, 11];
                case 10: return [7 /*endfinally*/];
                case 11:
                    opSuccess = true;
                    return [2 /*return*/];
            }
        });
    });
}
try { }
catch (err) {
    console.error("\u274C Crash on Op ".concat(op.id, ":"), err);
    opSuccess = true;
}
// ✅ RATE LIMITING: Always wait a bit between operators
await sleep(RATE_LIMIT_DELAY);
processedOps++;
if (processedOps % 5 === 0 || processedOps === opList.length) {
    console.log("   \uD83D\uDCDD Progress: ".concat(processedOps, "/").concat(opList.length, " operators checked. (Saved: ").concat(productsSaved, ")"));
}
;
;
await Promise.all(tasks);
console.log("\n\n\u2705 [Success] Sync Complete!");
console.log("   - Operators Processed: ".concat(processedOps));
console.log("   - Products Saved in DB: ".concat(productsSaved));
console.log('==================================================\n');
try { }
catch (error) {
    console.error('\n❌ [Sync] Script Crashed:', error);
}
finally {
    // await db.$disconnect();
}
if (require.main === module) {
    syncProducts();
}
