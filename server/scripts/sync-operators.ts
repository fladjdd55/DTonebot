import fs from 'fs';
import path from 'path';
import { dtoneService } from '../dtone';

// Target File: client/src/shared/operatorList.ts
const TARGET_FILE = path.join(__dirname, '../../client/src/shared/operatorList.ts');

export async function syncOperators() {
  console.log('\n🔄 [Cache] Starting Daily Operator Sync...');
  
  try {
    // 1. Fetch all operators from DTOne
    const apiResponse = await dtoneService.getAllOperators(1); // Service 1 = Mobile

    if (!apiResponse.success || !apiResponse.data) {
      throw new Error(apiResponse.error || 'Failed to fetch operators');
    }

    const operators = apiResponse.data;
    console.log(`   ✅ Retrieved ${operators.length} operators.`);

    // 2. Generate File Content
    const fileContent = `/**
 * AUTO-GENERATED FILE
 * Source: DTOne API (Cached Operator List)
 * Timestamp: ${new Date().toISOString()}
 * * Run 'npx ts-node server/scripts/sync-operators.ts' to update.
 */

export interface Operator {
  id: number;
  name: string;
  countryCode: string;
}

export const OPERATORS: Operator[] = ${JSON.stringify(operators, null, 2)};

export const getOperatorsByCountry = (isoCode: string) => {
  return OPERATORS.filter(op => op.countryCode === isoCode);
};

export const getOperatorById = (id: number) => {
  return OPERATORS.find(op => op.id === id);
};
`;

    // 3. Write to File
    const dir = path.dirname(TARGET_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(TARGET_FILE, fileContent);
    console.log(`   💾 Operator cache saved to: ${TARGET_FILE}`);

    return operators;

  } catch (error: any) {
    console.error('\n❌ OPERATOR SYNC FAILED:', error.message);
    return null;
  }
}

// Allow standalone execution
if (require.main === module) {
  syncOperators();
}
