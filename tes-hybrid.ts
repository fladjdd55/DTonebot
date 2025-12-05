import { DVS } from '@dtone/dvs';
import dotenv from 'dotenv';

dotenv.config();

const dvs = new DVS({
  apiKey: process.env.DTONE_API_KEY as string,
  apiSecret: process.env.DTONE_API_SECRET as string,
  baseUrl: process.env.DTONE_MODE === 'production' 
    ? 'https://dvs-api.dtone.com/v1' 
    : 'https://preprod-dvs-api.dtone.com/v1'
});

// Interface for Safe Access
interface IProduct {
  id: number;
  name: string;
  service: {
    id: number;
    name: string;
    subservice?: {
      id: number;
      name: string;
    };
  };
}

async function getProductByOperatorAndSubservice(
  phoneNumber: string,
  operatorId: number,
  subServiceId: number
) {
  console.log(`\n--- HYBRID SEARCH ---`);
  console.log(`1. Target Mobile:      ${phoneNumber}`);
  console.log(`2. Target Operator ID: ${operatorId}`);
  console.log(`3. Target SubService:  ${subServiceId}`);

  try {
    const matchedProducts: any[] = [];

    // STRATEGY: 
    // We use the method you PROVED works (Operator ID) to get the list.
    // Then we filter locally for the SubService.
    console.log(`\n[API] Fetching products for Operator ${operatorId}...`);
    
    const iterator = dvs.discovery.products.get({
      params: {
        operator_id: operatorId,
        type: 'RANGED_VALUE_RECHARGE', // As you requested
        per_page: 100
      }
    });

    for await (const p of iterator) {
      const raw = p as any;
      
      // SAFE CHECK: Does this product match our SubService?
      const pSubId = raw.service?.subservice?.id;

      if (pSubId === subServiceId) {
        // FOUND A MATCH!
        matchedProducts.push({
          id: raw.id,
          name: raw.name,
          type: raw.type,
          service: raw.service?.name,
          subservice: raw.service?.subservice?.name,
          // Format Amount for display
          amount: raw.destination?.amount 
            ? (raw.destination.amount.min ? `${raw.destination.amount.min}-${raw.destination.amount.max}` : raw.destination.amount) 
            : 'N/A',
          currency: raw.destination?.unit
        });
      }
    }

    // RESULTS
    console.log(`\n[RESULT] Found ${matchedProducts.length} matching products for this SubService.`);
    
    if (matchedProducts.length > 0) {
      console.log(JSON.stringify(matchedProducts, null, 2));
      
      // SIMULATE NEXT STEP:
      const bestMatch = matchedProducts[0];
      console.log(`\n[NEXT STEP] You can now call purchaseProduct() with:`);
      console.log(` - Product ID: ${bestMatch.id}`);
      console.log(` - Mobile:     ${phoneNumber}`);
    } else {
      console.log(`[INFO] Operator has products, but none matched SubService ID ${subServiceId}.`);
    }

  } catch (error: any) {
    console.error("\n[ERROR]", error.message);
  }
}

// ==========================================
// TEST INPUTS (Based on your successful snippet)
// ==========================================
const INPUT_PHONE = '+50933186657';
const INPUT_OPERATOR_ID = 1703; // Natcom Haiti
const INPUT_SUBSERVICE_ID = 11; // "Airtime" (From your JSON)

getProductByOperatorAndSubservice(INPUT_PHONE, INPUT_OPERATOR_ID, INPUT_SUBSERVICE_ID);
