// src/validators/countryValidator.ts
import { getCountryCallingCode } from 'libphonenumber-js';

export interface Country {
  name: string;
  code: string;     // ISO2 (e.g. US)
  iso3: string;     // ISO3 (e.g. USA)
  dialCode: string;
}

/**
 * List of supported countries with ISO3 codes added
 */
export const COUNTRIES: Country[] = [
  { name: 'United States', code: 'US', iso3: 'USA', dialCode: '+1' },
  { name: 'United Kingdom', code: 'GB', iso3: 'GBR', dialCode: '+44' },
  { name: 'Canada', code: 'CA', iso3: 'CAN', dialCode: '+1' },
  { name: 'Australia', code: 'AU', iso3: 'AUS', dialCode: '+61' },
  { name: 'Germany', code: 'DE', iso3: 'DEU', dialCode: '+49' },
  { name: 'France', code: 'FR', iso3: 'FRA', dialCode: '+33' },
  { name: 'Spain', code: 'ES', iso3: 'ESP', dialCode: '+34' },
  { name: 'Mexico', code: 'MX', iso3: 'MEX', dialCode: '+52' },
  { name: 'Brazil', code: 'BR', iso3: 'BRA', dialCode: '+55' },
  { name: 'Argentina', code: 'AR', iso3: 'ARG', dialCode: '+54' },
  { name: 'India', code: 'IN', iso3: 'IND', dialCode: '+91' },
  { name: 'Belgium', code: 'BE', iso3: 'BEL', dialCode: '+32' },
  { name: 'Greece', code: 'GR', iso3: 'GRC', dialCode: '+30' },
  { name: 'Portugal', code: 'PT', iso3: 'PRT', dialCode: '+351' },
  { name: 'Czech Republic', code: 'CZ', iso3: 'CZE', dialCode: '+420' },
  { name: 'Hungary', code: 'HU', iso3: 'HUN', dialCode: '+36' },
  { name: 'New Zealand', code: 'NZ', iso3: 'NZL', dialCode: '+64' },
  { name: 'Chile', code: 'CL', iso3: 'CHL', dialCode: '+56' },
  { name: 'Colombia', code: 'CO', iso3: 'COL', dialCode: '+57' },
  { name: 'Peru', code: 'PE', iso3: 'PER', dialCode: '+51' },
  { name: 'Venezuela', code: 'VE', iso3: 'VEN', dialCode: '+58' },
];

/**
 * Gets all available countries sorted alphabetically
 */
export const getAllCountries = (): Country[] => {
  return [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Filters countries based on search query (Name, Code, ISO3, or Dial Code)
 */
export const filterCountries = (query: string, countries: Country[] = COUNTRIES): Country[] => {
  if (!query) return getAllCountries();
  
  const searchTerm = query.toLowerCase();
  
  return countries.filter(country =>
    country.name.toLowerCase().includes(searchTerm) ||
    country.code.toLowerCase().includes(searchTerm) || // Search by 'US'
    country.iso3.toLowerCase().includes(searchTerm) || // Search by 'USA'
    country.dialCode.includes(searchTerm)              // Search by '+1'
  );
};

/**
 * Finds a country by its code
 */
export const getCountryByCode = (code: string): Country | undefined => {
  return COUNTRIES.find(country => country.code === code);
};

/**
 * Validates if a country code is supported
 */
export const isCountrySupported = (code: string): boolean => {
  return COUNTRIES.some(country => country.code === code);
};

/**
 * Gets the dial code for a specific country code
 */
export const getCountryDialCode = (countryCode: string): string => {
  const country = getCountryByCode(countryCode);
  if (country) return country.dialCode;
  
  try {
    return `+${getCountryCallingCode(countryCode)}`;
  } catch {
    return '+--';
  }
};
