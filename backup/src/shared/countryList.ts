/**
 * AUTO-GENERATED FILE
 * Source: DTOne API (Service ID 1)
 * Timestamp: 2025-12-05T04:50:00.077Z
 */

export interface Country {
  name: string;
  code: string;     // ISO2
  iso3: string;     // ISO3
  dialCode: string;
}

export const COUNTRIES: Country[] = [];

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
