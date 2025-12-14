// server/scripts/sync-products.ts

// ✅ FIX: Force IPv4 to prevent network hangs
import dns from 'node:dns';
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

console.log("🚀 Script started! If you see this, the file is running.");

import dotenv from 'dotenv';
import path from 'path';
import pLimit from 'p-limit'; 

// Force load .env from the root directory
const envPath = path.resolve(__dirname, '../../.env');
console.log(`📂 Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });

import { db } from '../db';
import { dtoneService } from '../dtone';

// ⚡ CONFIGURATION (SAFE MODE)
const CONCURRENCY = 1;      // Process 1 operator at a time to respect limits
const RATE_LIMIT_DELAY = 1000; // Wait 1 second between operators
const RETRY_DELAY = 10000;   // Wait 10 seconds if we hit a 429 Error

// Helper: Sleep function
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function syncProducts() {
  console.log('\n==================================================');
  console.log('📦 [Sync] Starting Product Catalog Refresh (Safe Mode)');
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
    const currentCount = await db.product.count(); 
    console.log(`   (Current products in DB: ${currentCount})`);

    // 3. Fetch Operators
    console.log('📡 Connecting to DTOne to fetch operators...');
    
    // Simple retry for the main operator list
    let opList: any[] = [];
    let attempts = 0;
    while (attempts < 3 && opList.length === 0) {
        attempts++;
        const res = await dtoneService.getAllOperators();
        if (res.success && res.data) {
            opList = res.data;
        } else {
            console.warn(`⚠️  Failed to fetch operators (Attempt ${attempts}). Retrying in 3s...`);
            await sleep(3000);
        }
    }

    if (opList.length === 0) {
      console.error('❌ Failed to get operators. Aborting.');
      return;
    }

    console.log(`✅ Found ${opList.length} operators.`);

    // 4. Process Operators (Sequential Safe Mode)
    console.log(`🔄 Fetching products for ${opList.length} operators...`);
    
    const limit = pLimit(CONCURRENCY);
    let processedOps = 0;
    let productsSaved = 0;

    const tasks = opList.map((op) => {
      return limit(async () => {
        let opSuccess = false;
        let opRetries = 0;

        while (!opSuccess && opRetries < 3) {
            try {
                // Fetch products
                const apiRes = await dtoneService.getProductsForOperator(op.id, 1, 100, 'en');
                
                // CASE 1: Rate Limit Hit
                if (!apiRes.success && (apiRes.error?.includes('Too Many Requests') || apiRes.code === '429')) {
                    opRetries++;
                    console.warn(`⏳ Rate Limit Hit on Op ${op.id}. Pausing ${RETRY_DELAY/1000}s...`);
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
                        
                        return db.product.upsert({
                            where: { id: p.id },
                            update: {
                                name: p.name,
                                amount: fixedAmount,
                                minAmount: p.min,
                                maxAmount: p.max,
                                serviceId: p.subserviceId || 1,
                                // ✅ NEW: Update cost price
                                costPrice: p.costPrice || null,
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
                                maxAmount: p.max,
                                // ✅ NEW: Save cost price
                                costPrice: p.costPrice || null,
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

            } catch (err) {
                console.error(`❌ Crash on Op ${op.id}:`, err);
                opSuccess = true;
            }
        }

        // ✅ RATE LIMITING: Always wait a bit between operators
        await sleep(RATE_LIMIT_DELAY);

        processedOps++;
        if (processedOps % 5 === 0 || processedOps === opList.length) {
            console.log(`   📝 Progress: ${processedOps}/${opList.length} operators checked. (Saved: ${productsSaved})`);
        }
      });
    });

    await Promise.all(tasks);

    console.log(`\n\n✅ [Success] Sync Complete!`);
    console.log(`   - Operators Processed: ${processedOps}`);
    console.log(`   - Products Saved in DB: ${productsSaved}`);
    console.log('==================================================\n');

  } catch (error: any) {
    console.error('\n❌ [Sync] Script Crashed:', error);
  } finally {
    // await db.$disconnect();
  }
}

if (require.main === module) {
  syncProducts();
}
