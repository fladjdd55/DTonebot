"use strict";
// server/scripts/sync-products.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncProducts = syncProducts;
// ✅ FIX: Force IPv4 to prevent network hangs
const node_dns_1 = __importDefault(require("node:dns"));
if (node_dns_1.default.setDefaultResultOrder) {
    node_dns_1.default.setDefaultResultOrder('ipv4first');
}
console.log("🚀 Script started! If you see this, the file is running.");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs")); // ✅ Added fs for checkpoints
const p_limit_1 = __importDefault(require("p-limit"));
// Force load .env from the root directory
const envPath = path_1.default.resolve(__dirname, '../../.env');
console.log(`📂 Loading .env from: ${envPath}`);
dotenv_1.default.config({ path: envPath });
const db_1 = require("../db");
const dtone_1 = require("../dtone");
// ⚡ CONFIGURATION (OPTIMIZED)
const CONCURRENCY = 5; // ✅ Increased to 5 for faster syncing
const RATE_LIMIT_DELAY = 1000; // Wait 1 second between operators per worker
const RETRY_DELAY = 10000; // Wait 10 seconds if we hit a 429 Error
const CHECKPOINT_FILE = path_1.default.resolve(__dirname, 'sync-checkpoint.json'); // ✅ Checkpoint file path
// Helper: Sleep function
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// ✅ CHECKPOINT HELPERS
function loadCheckpoint() {
    try {
        if (fs_1.default.existsSync(CHECKPOINT_FILE)) {
            const data = fs_1.default.readFileSync(CHECKPOINT_FILE, 'utf-8');
            const json = JSON.parse(data);
            return new Set(json.processed || []);
        }
    }
    catch (e) {
        console.warn("⚠️ Could not load checkpoint, starting fresh.");
    }
    return new Set();
}
function saveCheckpoint(processed) {
    try {
        fs_1.default.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ processed: Array.from(processed) }, null, 2));
    }
    catch (e) {
        console.error("⚠️ Failed to save checkpoint.");
    }
}
async function syncProducts() {
    console.log('\n==================================================');
    console.log('📦 [Sync] Starting Product Catalog Refresh (Optimized)');
    console.log('==================================================');
    // 1. Check API Key
    const key = process.env.DTONE_API_KEY;
    if (!key) {
        console.error('❌ FATAL: DTONE_API_KEY is missing in process.env');
        return;
    }
    console.log(`🔑 API Key loaded: ${key.substring(0, 4)}...`);
    try {
        // 2. Connect to DB
        console.log('🗄️  Connecting to Database...');
        const currentCount = await db_1.db.product.count();
        console.log(`   (Current products in DB: ${currentCount})`);
        // 3. Fetch Operators
        console.log('📡 Connecting to DTOne to fetch operators...');
        // Simple retry for the main operator list
        let opList = [];
        let attempts = 0;
        while (attempts < 3 && opList.length === 0) {
            attempts++;
            const res = await dtone_1.dtoneService.getAllOperators();
            if (res.success && res.data) {
                opList = res.data;
            }
            else {
                console.warn(`⚠️  Failed to fetch operators (Attempt ${attempts}). Retrying in 3s...`);
                await sleep(3000);
            }
        }
        if (opList.length === 0) {
            console.error('❌ Failed to get operators. Aborting.');
            return;
        }
        console.log(`✅ Found ${opList.length} operators.`);
        // ✅ 4. Load Checkpoint & Filter
        const processedIds = loadCheckpoint();
        if (processedIds.size > 0) {
            console.log(`📂 Resuming from checkpoint: ${processedIds.size} operators already done.`);
        }
        // Filter out operators that are already in the checkpoint
        const opsToProcess = opList.filter(op => !processedIds.has(op.id));
        if (opsToProcess.length === 0) {
            console.log('🎉 All operators already processed! Clearing checkpoint.');
            if (fs_1.default.existsSync(CHECKPOINT_FILE))
                fs_1.default.unlinkSync(CHECKPOINT_FILE);
            return;
        }
        // 5. Process Operators (Parallel with Limit)
        console.log(`🔄 Processing ${opsToProcess.length} remaining operators (Concurrency: ${CONCURRENCY})...`);
        const limit = (0, p_limit_1.default)(CONCURRENCY);
        let processedOps = 0;
        let productsSaved = 0;
        const totalOps = opsToProcess.length;
        const tasks = opsToProcess.map((op) => {
            return limit(async () => {
                let opSuccess = false;
                let opRetries = 0;
                while (!opSuccess && opRetries < 3) {
                    try {
                        // Fetch products
                        const apiRes = await dtone_1.dtoneService.getProductsForOperator(op.id, 1, 100, 'en');
                        // CASE 1: Rate Limit Hit
                        if (!apiRes.success && (apiRes.error?.includes('Too Many Requests') || apiRes.code === '429')) {
                            opRetries++;
                            console.warn(`⏳ Rate Limit Hit on Op ${op.id}. Pausing ${RETRY_DELAY / 1000}s...`);
                            await sleep(RETRY_DELAY);
                            continue; // Retry loop
                        }
                        // CASE 2: Other Error
                        if (!apiRes.success) {
                            opSuccess = true; // Treat as "done" so we don't retry forever on 404s
                            break;
                        }
                        // CASE 3: Success
                        if (apiRes.data && apiRes.data.length > 0) {
                            // ✅ Handle individual writes safely
                            const upsertPromises = apiRes.data.map((p) => {
                                const fixedAmount = p.amount && p.amount !== 'N/A' ? parseFloat(p.amount.split(' ')[0]) : 0;
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
                                        minAmount: p.min || null,
                                        maxAmount: p.max || null,
                                        costPrice: p.costPrice || null,
                                        costPriceMin: p.costPriceMin || null,
                                        costPriceMax: p.costPriceMax || null,
                                        costCurrency: p.costCurrency || 'USD'
                                    }
                                }).catch(err => {
                                    console.error(`   ❌ Failed to save product ${p.id}:`, err.message);
                                    return null;
                                });
                            });
                            const results = await Promise.all(upsertPromises);
                            productsSaved += results.filter(r => r !== null).length;
                        }
                        opSuccess = true;
                    }
                    catch (err) {
                        console.error(`❌ Crash on Op ${op.id}:`, err);
                        opSuccess = true;
                    }
                }
                // ✅ UPDATE CHECKPOINT ON SUCCESS
                if (opSuccess) {
                    processedIds.add(op.id);
                    saveCheckpoint(processedIds);
                }
                // ✅ RATE LIMITING: Always wait a bit between operators
                await sleep(RATE_LIMIT_DELAY);
                processedOps++;
                if (processedOps % 10 === 0 || processedOps === totalOps) {
                    console.log(`   📝 Progress: ${processedOps}/${totalOps} operators checked. (Saved: ${productsSaved})`);
                }
            });
        });
        await Promise.all(tasks);
        console.log(`\n\n✅ [Success] Sync Complete!`);
        console.log(`   - Operators Processed: ${processedOps}`);
        console.log(`   - Products Saved in DB: ${productsSaved}`);
        // ✅ Cleanup Checkpoint
        if (fs_1.default.existsSync(CHECKPOINT_FILE)) {
            fs_1.default.unlinkSync(CHECKPOINT_FILE);
            console.log('   - Checkpoint file cleared for next run.');
        }
        console.log('==================================================\n');
    }
    catch (error) {
        console.error('\n❌ [Sync] Script Crashed:', error);
    }
    finally {
        // await db.$disconnect();
    }
}
if (require.main === module) {
    syncProducts();
}
