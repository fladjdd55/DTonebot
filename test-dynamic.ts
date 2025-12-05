import { dtoneService } from './server/dtone';
import dotenv from 'dotenv';
// Assuming you have a file named server/types.ts defining the interfaces
import type { ApiResponse, LookupResult, Product, TransactionResult } from './server/types';

dotenv.config();

const inputMobile = process.argv[2] || '+50936000000';

async function runDynamicTest() {
  console.log(`\n🚀 STARTING DYNAMIC TEST FOR: ${inputMobile}`);
  console.log('--------------------------------------------------');

  try {
    // =========================================================
    // STEP 1: DYNAMIC LOOKUP (Check Success before accessing .data)
    // =========================================================
    console.log(`[1] Identifying Operator...`);
    
    const operatorResult = await dtoneService.lookupMobileNumber(inputMobile);

    if (!operatorResult.success) {
      // TypeScript knows 'error' and 'code' exist here.
      console.error(`\n❌ LOOKUP FAILED: ${operatorResult.error} (Code: ${operatorResult.code})`);
      return; 
    }
    
    // Type Guard applied: operator is now safely known as LookupResult
    const operator = operatorResult.data;

    // Access to properties is now safe
    console.log(`   ✅ Identified: ${operator.operatorName}`);
    console.log(`   ✅ Operator ID: ${operator.operatorId}`);

    // =========================================================
    // STEP 2: GET PRODUCTS (Check Success before accessing .data)
    // =========================================================
    console.log(`\n[2] Fetching inventory for Operator ${operator.operatorId}...`);

    const productsResult = await dtoneService.getProductsForOperator(operator.operatorId, 1, 50);

    if (!productsResult.success) {
      console.error(`\n❌ PRODUCTS FETCH FAILED: ${productsResult.error} (Code: ${productsResult.code})`);
      return;
    }
    
    // Type Guard applied: products is now safely known as Product[]
    const products = productsResult.data;

    if (products.length === 0) { // <- .length access is now safe
      console.warn(`\n⚠️  Operator ${operator.operatorName} identified, but has no products.`);
      return;
    }

    const targetProduct = products[0];
    console.log(`   ✅ Found Product: [${targetProduct.id}] ${targetProduct.name}`);

    // =========================================================
    // STEP 3 & 4: EXECUTE TRANSACTION
    // =========================================================
    let amountToSend = 50; 
    if (targetProduct.min && targetProduct.max) {
      amountToSend = Math.max(targetProduct.min, 50); 
    }
    
    console.log(`\n[3] Purchasing Amount: ${amountToSend} ${targetProduct.currency}...`);

    const transactionResult = await dtoneService.purchaseProduct(
      targetProduct.id,
      inputMobile,
      amountToSend
    );

    if (!transactionResult.success) {
      console.error(`\n❌ TRANSACTION FAILED: ${transactionResult.error} (Code: ${transactionResult.code})`);
      return;
    }

    // Access the clean transaction data
    const txnData = transactionResult.data;

    console.log('\n🎉 DYNAMIC FLOW SUCCESSFUL!');
    console.log('--------------------------------------------------');
    console.log(`Transaction ID: ${txnData.id}`); // <- Fixed
    console.log(`Status:         ${txnData.status}`); // <- Fixed
    console.log('--------------------------------------------------');

  } catch (error: any) {
    console.error('\n❌ UNCAUGHT TEST FAILED:', error.message);
  }
}

runDynamicTest();
