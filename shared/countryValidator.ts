// shared/countryValidator.ts
import { getCountryCallingCode } from 'libphonenumber-js';

export interface Country {
  name: string;
  code: string;     // ISO2 (e.g. US)
  iso3: string;     // ISO3 (e.g. USA)
  dialCode: string;
}


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
