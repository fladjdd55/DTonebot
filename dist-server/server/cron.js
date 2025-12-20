"use strict";
// server/cron.ts - ADD NEW CRON JOB
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCronJobs = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const redis_1 = require("./services/redis");
const sync_countries_1 = require("./scripts/sync-countries");
const sync_operators_1 = require("./scripts/sync-operators");
const sync_products_1 = require("./scripts/sync-products");
const db_1 = require("./db"); // ✅ ADD THIS
const client_1 = require("@prisma/client"); // ✅ ADD THIS
const redis = (0, redis_1.getRedis)();
const CACHE_TTL = 3600;
const startCronJobs = () => {
    // Existing daily sync (keep as-is)
    node_cron_1.default.schedule('0 3 * * *', async () => {
        const lockKey = 'cron:daily_sync:lock';
        const acquired = await redis.set(lockKey, '1', 'EX', 600, 'NX');
        if (!acquired) {
            console.log('[Scheduler] ⏭️ Skipping Daily Sync (Locked by another instance)');
            return;
        }
        console.log('[Scheduler] 🌙 Running Daily Sync...');
        try {
            const [c, o] = await Promise.all([(0, sync_countries_1.syncCountries)(), (0, sync_operators_1.syncOperators)()]);
            if (c)
                await redis.set('cache:countries', JSON.stringify(c), CACHE_TTL);
            if (o) {
                await redis.set('cache:operators', JSON.stringify(o), CACHE_TTL);
                const index = {};
                for (const op of o) {
                    const code = (op.countryCode || op.countryIso)?.toUpperCase();
                    if (code) {
                        if (!index[code])
                            index[code] = [];
                        index[code].push(op);
                    }
                }
                await redis.set('cache:operator_index', JSON.stringify(index), CACHE_TTL);
            }
            await (0, sync_products_1.syncProducts)();
            console.log('[Scheduler] ✅ Daily Sync Completed');
        }
        catch (e) {
            console.error('[Scheduler] ❌ Daily Sync Failed', e);
        }
        finally {
            await redis.del(lockKey);
        }
    });
    // ✅ FIX: NEW CRON - Cleanup old transactions (runs every 6 hours)
    node_cron_1.default.schedule('0 */6 * * *', async () => {
        const lockKey = 'cron:cleanup_transactions:lock';
        const acquired = await redis.set(lockKey, '1', 'EX', 300, 'NX');
        if (!acquired) {
            console.log('[Scheduler] ⏭️ Skipping Cleanup (Locked)');
            return;
        }
        console.log('[Scheduler] 🧹 Cleaning up old transactions...');
        try {
            const oneDayAgo = new Date(Date.now() - 86400000); // 24 hours
            const result = await db_1.db.transaction.deleteMany({
                where: {
                    status: client_1.TransactionStatus.INITIALIZED,
                    createdAt: { lt: oneDayAgo }
                }
            });
            console.log(`[Scheduler] ✅ Deleted ${result.count} old INITIALIZED transactions`);
        }
        catch (e) {
            console.error('[Scheduler] ❌ Cleanup Failed', e);
        }
        finally {
            await redis.del(lockKey);
        }
    });
};
exports.startCronJobs = startCronJobs;
