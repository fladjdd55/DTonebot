"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncOperators = syncOperators;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dtone_1 = require("../dtone");
// Target File: client/src/shared/operatorList.ts
const TARGET_FILE = path_1.default.join(__dirname, '../../client/src/shared/operatorList.ts');
async function syncOperators() {
    console.log('\n🔄 [Cache] Starting Daily Operator Sync...');
    try {
        // 1. Fetch all operators from DTOne
        const apiResponse = await dtone_1.dtoneService.getAllOperators(1); // Service 1 = Mobile
        if (!apiResponse.success || !apiResponse.data) {
            throw new Error(apiResponse.error || 'Failed to fetch operators');
        }
        const operators = apiResponse.data;
        console.log(`   ✅ Retrieved ${operators.length} operators.`);
        // 2. Generate File Content with STRICT TYPES
        const fileContent = `/**
 * AUTO-GENERATED FILE
 * Source: DTOne API (Cached Operator List)
 * Timestamp: ${new Date().toISOString()}
 * * Run 'npx ts-node server/scripts/sync-operators.ts' to update.
 */

export interface Region {
  name: string;
  code: string;
}

export interface Operator {
  id: number;
  name: string;
  countryCode: string;
  regions: Region[] | null; // 👈 Strict type instead of 'any'
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
        const dir = path_1.default.dirname(TARGET_FILE);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        fs_1.default.writeFileSync(TARGET_FILE, fileContent);
        console.log(`   💾 Operator cache saved to: ${TARGET_FILE}`);
        return operators;
    }
    catch (error) {
        console.error('\n❌ OPERATOR SYNC FAILED:', error.message);
        return null;
    }
}
// Allow standalone execution
if (require.main === module) {
    syncOperators();
}
