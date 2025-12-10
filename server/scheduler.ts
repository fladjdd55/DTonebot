import cron from 'node-cron';
import { syncProducts } from './scripts/sync-products';

console.log('⏳ Scheduler started... waiting for 3:00 AM');

// Run at 03:00 AM every day
cron.schedule('0 3 * * *', async () => {
  console.log('⏰ Nightly Sync Starting...');
  await syncProducts();
});
