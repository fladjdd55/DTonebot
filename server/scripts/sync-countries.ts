import fs from 'fs';
import path from 'path';

// CONFIGURATION
const API_URL = 'http://localhost:5000/api/countries';
// This resolves to: root/client/src/shared/countryValidator.ts
const TARGET_FILE = path.join(__dirname, '../../client/src/shared/countryValidator.ts');

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
    
    // SAFETY CHECK: Abort if list is empty to avoid breaking the app
    if (!Array.isArray(countries) || countries.length === 0) {
      throw new Error('Received 0 countries from API. Aborting sync to preserve existing data.');
    }

    console.log(`   ✅ API returned ${countries.length} countries.`);

    // 3. Generate File Content
    // UPDATED: Functions now accept the 'countries' array as the first argument
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

/**
 * Returns all countries, sorted by name.
 * Accepts the live list as an argument (defaults to static list).
 */
export const getAllCountries = (countries: Country[] = COUNTRIES): Country[] => {
  return [...countries].sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Filters the list of countries based on a search query.
 * Accepts the live list as the first argument to avoid "toLowerCase" crashes.
 */
export const filterCountries = (countries: Country[], query: string): Country[] => {
  // Safety check
  const list = countries || [];
  
  if (!query) return getAllCountries(list);
  
  const term = query.toLowerCase();
  return list.filter(c =>
    c.name.toLowerCase().includes(term) ||
    c.code.toLowerCase().includes(term) ||
    c.dialCode.includes(term)
  );
};

/**
 * Finds a country by its ISO2 code.
 */
export const getCountryByCode = (countries: Country[], code: string) => 
  countries.find(c => c.code === code);

/**
 * Checks if a country code is supported.
 */
export const isCountrySupported = (countries: Country[], code: string) => 
  countries.some(c => c.code === code);
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
