import fs from 'fs';
import path from 'path';

// CONFIGURATION
const API_URL = 'http://localhost:5000/api/countries';
// This resolves to: root/client/src/shared/countryValidator.ts
const TARGET_FILE = path.join(__dirname, '../../src/shared/countryValidator.ts');

async function syncCountries() {
  console.log('\n🔄 SYNCING MOBILE-SUPPORTED COUNTRIES...');
  console.log(`   Source: ${API_URL}`);
  console.log(`   Target: ${TARGET_FILE}`);
  
  try {
    // 1. Ensure Directory Exists (Fixes ENOENT error if folder is missing)
    const dir = path.dirname(TARGET_FILE);
    if (!fs.existsSync(dir)) {
      console.log(`   📂 Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }

    // 2. Fetch live data from your running backend
    const response = await fetch(API_URL);
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const countries = await response.json();
    console.log(`   ✅ API returned ${countries.length} countries.`);

    if (countries.length === 0) {
      console.warn("   ⚠️  WARNING: Received 0 countries. Check if server/dtone.ts is parsing keys correctly.");
    }

    // 3. Generate File Content
    const fileContent = `/**
 * AUTO-GENERATED FILE
 * Source: DTOne API (Service ID 1)
 * Timestamp: ${new Date().toISOString()}
 * * DO NOT EDIT MANUALLY. Run 'npx ts-node server/scripts/sync-countries.ts' to update.
 */

export interface Country {
  name: string;
  code: string;     // ISO2
  iso3: string;     // ISO3
  dialCode: string;
}

export const COUNTRIES: Country[] = ${JSON.stringify(countries, null, 2)};

export const getAllCountries = (): Country[] => {
  return [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name));
};

export const filterCountries = (query: string): Country[] => {
  if (!query) return getAllCountries();
  const term = query.toLowerCase();
  return COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(term) ||
    c.code.toLowerCase().includes(term) ||
    c.dialCode.includes(term)
  );
};

export const getCountryByCode = (code: string) => COUNTRIES.find(c => c.code === code);
export const isCountrySupported = (code: string) => COUNTRIES.some(c => c.code === code);
`;

    // 4. Write File
    fs.writeFileSync(TARGET_FILE, fileContent);
    console.log(`   🎉 SUCCESS: File updated at ${TARGET_FILE}`);

  } catch (error: any) {
    console.error('\n❌ SYNC FAILED:', error.message);
    if (error.cause?.code === 'ECONNREFUSED') {
      console.error('   Hint: Is "npx ts-node server/Routes.ts" running in another terminal?');
    }
  }
}

syncCountries();
