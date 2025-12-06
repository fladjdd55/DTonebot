import fs from 'fs';
import path from 'path';

// 🚀 DYNAMIC PORT: Reads from environment or defaults to 5000
const PORT = process.env.PORT || 5000;
const API_URL = `http://localhost:${PORT}/api/countries`;

const TARGET_FILE = path.join(__dirname, '../../client/src/shared/countryValidator.ts');

async function syncCountries() {
  console.log('\n🔄 SYNCING MOBILE-SUPPORTED COUNTRIES...');
  console.log(`   Source: ${API_URL}`);
  
  try {
    const dir = path.dirname(TARGET_FILE);
    if (!fs.existsSync(dir)) {
      console.log(`   📂 Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }

    const response = await fetch(API_URL);
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const countries = await response.json();
    console.log(`   ✅ API returned ${countries.length} countries.`);

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

    fs.writeFileSync(TARGET_FILE, fileContent);
    console.log(`   🎉 SUCCESS: File updated at ${TARGET_FILE}`);

  } catch (error: any) {
    console.error('\n❌ SYNC FAILED:', error.message);
  }
}

// Allow standalone run
if (require.main === module) {
  syncCountries();
}

// Export for Routes.ts
export { syncCountries };
