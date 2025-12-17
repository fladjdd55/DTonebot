"use strict";
// shared/countryValidator.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCountrySupported = exports.getCountryByCode = exports.filterCountries = exports.getAllCountries = void 0;
const getAllCountries = (countries) => {
    return [...(countries || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
};
exports.getAllCountries = getAllCountries;
const filterCountries = (countries, query) => {
    const list = countries || [];
    if (!query)
        return (0, exports.getAllCountries)(list);
    const term = query.toLowerCase().trim();
    return list.filter(c => {
        // 🛡️ Safety checks: Ensure property exists before .toLowerCase()
        const nameMatch = c.name && c.name.toLowerCase().includes(term);
        const codeMatch = c.code && c.code.toLowerCase().includes(term);
        const iso3Match = c.iso3 && c.iso3.toLowerCase().includes(term);
        const dialMatch = c.dialCode && c.dialCode.includes(term);
        return nameMatch || codeMatch || iso3Match || dialMatch;
    });
};
exports.filterCountries = filterCountries;
const getCountryByCode = (countries, code) => (countries || []).find(c => c.code === code);
exports.getCountryByCode = getCountryByCode;
const isCountrySupported = (countries, code) => (countries || []).some(c => c.code === code);
exports.isCountrySupported = isCountrySupported;
