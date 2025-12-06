// shared/countryValidator.ts

export interface Country {
  name: string;
  code: string;     // ISO2
  iso3: string;     // ISO3
  dialCode: string;
}

// Helper to sort countries
export const getAllCountries = (countries: Country[]): Country[] => {
  return [...countries].sort((a, b) => a.name.localeCompare(b.name));
};

// The logic you fixed earlier, now centralized here
export const filterCountries = (countries: Country[], query: string): Country[] => {
  const list = countries || [];
  
  if (!query) return getAllCountries(list);
  
  const term = query.toLowerCase();
  return list.filter(c =>
    c.name.toLowerCase().includes(term) ||
    c.code.toLowerCase().includes(term) ||
    c.dialCode.includes(term)
  );
};

export const getCountryByCode = (countries: Country[], code: string) => 
  (countries || []).find(c => c.code === code);

export const isCountrySupported = (countries: Country[], code: string) => 
  (countries || []).some(c => c.code === code);
