"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncCountries = syncCountries;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const libphonenumber_js_1 = require("libphonenumber-js");
const i18n_iso_countries_1 = __importDefault(require("i18n-iso-countries"));
const dtone_1 = require("../dtone");
// Target: client/src/shared/countryValidator.ts
const TARGET_FILE = path_1.default.join(__dirname, '../../client/src/shared/countryValidator.ts');
async function syncCountries() {
    console.log('\n🔄 SYNCING MOBILE-SUPPORTED COUNTRIES...');
    try {
        // 1. Fetch RAW data directly from Service (Bypass HTTP)
        const apiResponse = await dtone_1.dtoneService.getCountries(1);
        if (!apiResponse.success || !apiResponse.data) {
            throw new Error(apiResponse.error || 'Failed to fetch from DTOne');
        }
        const rawCountries = apiResponse.data;
        // 2. Enrich Data
        const enrichedCountries = rawCountries.map((c) => {
            let dialCode = '';
            const iso3 = (c.iso_code || '').toUpperCase();
            const iso2 = i18n_iso_countries_1.default.alpha3ToAlpha2(iso3);
            if (iso2) {
                try {
                    dialCode = `+${(0, libphonenumber_js_1.getCountryCallingCode)(iso2)}`;
                }
                catch (e) { /* Ignore */ }
            }
            if (!c.name || !iso3)
                return null;
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
        // 3. Write to File
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
        const dir = path_1.default.dirname(TARGET_FILE);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        fs_1.default.writeFileSync(TARGET_FILE, fileContent);
        console.log(`   🎉 SUCCESS: Cached ${enrichedCountries.length} countries to disk.`);
        return enrichedCountries;
    }
    catch (error) {
        console.error('\n❌ SYNC FAILED:', error.message);
        return null;
    }
}
// Allow standalone execution
if (require.main === module) {
    syncCountries();
}
