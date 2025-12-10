// server/scripts/sync-products.ts

console.log("🚀 Script started! If you see this, the file is running.");

import dotenv from 'dotenv';
import path from 'path';

// Force load .env from the root directory
const envPath = path.resolve(__dirname, '../../.env');
console.log(`📂 Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });

import { db } from '../db';
import { dtoneService } from '../dtone';

export async function syncProducts() {
  console.log('\n==================================================');
  console.log('📦 [Sync] Starting Product Catalog Refresh');
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
    const operatorCountDB = await db.product.count(); 
    console.log(`   (Current products in DB: ${operatorCountDB})`);

    // 3. Fetch Operators
    console.log('📡 Connecting to DTOne to fetch operators...');
    const operators = await dtoneService.getAllOperators(); 
    
    if (!operators.success || !operators.data) {
      console.error('❌ Failed to get operators. API Response:', operators.error);
      return;
    }

    const opList = operators.data;
    console.log(`✅ Found ${opList.length} operators.`);

    if (opList.length === 0) {
      console.warn('⚠️ No operators found. Check your API credentials or Service ID.');
      return;
    }

    let productCount = 0;
    let operatorCount = 0;

    // 4. Loop through operators
    console.log('🔄 Fetching products for each operator...');
    
    for (const op of opList) {
      operatorCount++;
      // Show progress every 5 operators to avoid spamming logs if it's fast
      if (operatorCount % 5 === 0) process.stdout.write(`\r   Processing Op ${operatorCount}/${opList.length}...`);

      const apiRes = await dtoneService.getProductsForOperator(op.id, 1, 100, 'en');
      
      if (apiRes.success && apiRes.data && apiRes.data.length > 0) {
        for (const p of apiRes.data) {
          const fixedAmount = p.amount && p.amount !== 'N/A' ? parseFloat(p.amount.split(' ')[0]) : 0;

          await db.product.upsert({
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
          });
          productCount++;
        }
      }
    }

    console.log(`\n\n✅ [Success] Sync Complete!`);
    console.log(`   - Operators Processed: ${operatorCount}`);
    console.log(`   - Products Saved in DB: ${productCount}`);
    console.log('==================================================\n');

  } catch (error: any) {
    console.error('\n❌ [Sync] Script Crashed:', error);
  }
}

// 🔥 EXECUTE IMMEDIATELY (No checks)
syncProducts();
