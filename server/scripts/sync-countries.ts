
import fs from 'fs';
import path from 'path';
import { getCountryCallingCode, CountryCode } from 'libphonenumber-js';
import isoCountries from 'i18n-iso-countries';
import { dtoneService } from '../dtone';

// Target: client/src/shared/countryValidator.ts
const TARGET_FILE = path.join(__dirname, '../../client/src/shared/countryValidator.ts');

export async function syncCountries() {
  console.log('\n🔄 [Cache] Starting Daily Sync...');

  try {
    // 1. Fetch RAW data from DTOne Service directly
    const apiResponse = await dtoneService.getCountries(1);

    if (!apiResponse.success || !apiResponse.data) {
      throw new Error(apiResponse.error || 'Failed to fetch from DTOne');
    }

    const rawCountries = apiResponse.data;

    // 2. Enrich Data (Add Dial Codes & Clean ISOs)
    const enrichedCountries = rawCountries.map((c) => {
      let dialCode = '';
      const iso3 = (c.iso_code || '').toUpperCase();

      const iso2 = isoCountries.alpha3ToAlpha2(iso3) as CountryCode;

      if (iso2) {
        try {
          dialCode = `+${getCountryCallingCode(iso2)}`;
        } catch (e) {
          // Ignore
        }
      }

      if (!c.name || !iso3) return null;

      return {
        name: c.name,
        code: iso2 || iso3,
        iso3: iso3,
        dialCode: dialCode
      };
    }).filter(c => c !== null && c.dialCode !== '');

    if (enrichedCountries.length === 0) {
      throw new Error('No valid countries found. Aborting.');
    }

    // 3. Write to File (Persistent Cache for Frontend)
    const fileContent = `/**
 * AUTO-GENERATED FILE
 * Source: DTOne API (Cached)
 * Timestamp: ${new Date().toISOString()}
 * * DO NOT EDIT MANUALLY. Run 'npx ts-node server/scripts/sync-countries.ts' to update.
 */

import { Country } from '../../../shared/countryValidator';
export * from '../../../shared/countryValidator';

export const COUNTRIES: Country[] = ${JSON.stringify(enrichedCountries, null, 2)};
`;

    const dir = path.dirname(TARGET_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(TARGET_FILE, fileContent);
    console.log(`   💾 Cache saved to disk: ${enrichedCountries.length} countries.`);

    // 4. RETURN DATA (Fixes the "void" error in Routes.ts)
    return enrichedCountries;

  } catch (error: any) {
    console.error('\n❌ SYNC FAILED:', error.message);
    return null;
  }
}

// Allow standalone execution
if (require.main === module) {
  syncCountries();
}
