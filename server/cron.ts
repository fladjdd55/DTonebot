// server/cron.ts - ADD NEW CRON JOB

import cron from 'node-cron';
import { getRedis } from './services/redis';
import { syncCountries } from './scripts/sync-countries';
import { syncOperators } from './scripts/sync-operators';
import { syncProducts } from './scripts/sync-products';
import { db } from './db'; // ✅ ADD THIS
import { TransactionStatus } from '@prisma/client'; // ✅ ADD THIS

const redis = getRedis();
const CACHE_TTL = 3600;

export const startCronJobs = () => {
  // Existing daily sync (keep as-is)
  cron.schedule('0 3 * * *', async () => {
    const lockKey = 'cron:daily_sync:lock';
    const acquired = await redis.set(lockKey, '1', 'EX', 600, 'NX');
    
    if (!acquired) {
      console.log('[Scheduler] ⏭️ Skipping Daily Sync (Locked by another instance)');
      return;
    }

    console.log('[Scheduler] 🌙 Running Daily Sync...');
    try {
      const [c, o] = await Promise.all([syncCountries(), syncOperators()]);
      if (c) await redis.set('cache:countries', JSON.stringify(c), CACHE_TTL);
      if (o) {
        await redis.set('cache:operators', JSON.stringify(o), CACHE_TTL);
        const index: Record<string, any[]> = {};
        for (const op of o) {
          const code = (op.countryCode || op.countryIso)?.toUpperCase();
          if (code) {
            if (!index[code]) index[code] = [];
            index[code].push(op);
          }
        }
        await redis.set('cache:operator_index', JSON.stringify(index), CACHE_TTL);
      }
      await syncProducts();
      console.log('[Scheduler] ✅ Daily Sync Completed');
    } catch (e) {
      console.error('[Scheduler] ❌ Daily Sync Failed', e);
    } finally {
      await redis.del(lockKey);
    }
  });

  // ✅ FIX: NEW CRON - Cleanup old transactions (runs every 6 hours)
  cron.schedule('0 */6 * * *', async () => {
    const lockKey = 'cron:cleanup_transactions:lock';
    const acquired = await redis.set(lockKey, '1', 'EX', 300, 'NX');
    
    if (!acquired) {
      console.log('[Scheduler] ⏭️ Skipping Cleanup (Locked)');
      return;
    }

    console.log('[Scheduler] 🧹 Cleaning up old transactions...');
    try {
      const oneDayAgo = new Date(Date.now() - 86400000); // 24 hours
      
      const result = await db.transaction.deleteMany({
        where: {
          status: TransactionStatus.INITIALIZED,
          createdAt: { lt: oneDayAgo }
        }
      });
      
      console.log(`[Scheduler] ✅ Deleted ${result.count} old INITIALIZED transactions`);
    } catch (e) {
      console.error('[Scheduler] ❌ Cleanup Failed', e);
    } finally {
      await redis.del(lockKey);
    }
  });
};
