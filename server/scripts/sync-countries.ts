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
    // 1. Ensure Directory Exists
    const dir = path.dirname(TARGET_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 2. Fetch live data
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    const countries = await response.json();
    
    if (!Array.isArray(countries) || countries.length === 0) {
      throw new Error('Received 0 countries. Aborting.');
    }

    // 3. Generate File Content
    // NOTICE: We now import the logic from the root shared folder
    // and re-export it so the rest of your app doesn't break.
    const fileContent = `/**
 * AUTO-GENERATED DATA FILE
 * Source: DTOne API
 * Logic imported from: /shared/countryValidator.ts
 * Timestamp: ${new Date().toISOString()}
 */

import { Country } from '../../../shared/countryValidator';
export * from '../../../shared/countryValidator';

// The Live Data List
export const COUNTRIES: Country[] = ${JSON.stringify(countries, null, 2)};
`;

    // 4. Write File
    fs.writeFileSync(TARGET_FILE, fileContent);
    console.log(`   🎉 SUCCESS: File updated at ${TARGET_FILE}`);

  } catch (error: any) {
    console.error('\n❌ SYNC FAILED:', error.message);
  }
}

syncCountries();
