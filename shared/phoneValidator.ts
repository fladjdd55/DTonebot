// shared/countryValidator.ts

export interface Country {
  name: string;
  code: string;     // ISO2
  iso3: string;     // ISO3
  dialCode: string;
}

export const getAllCountries = (countries: Country[]): Country[] => {
  return [...(countries || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
};

export const filterCountries = (countries: Country[], query: string): Country[] => {
  const list = countries || [];
  
  if (!query) return getAllCountries(list);
  
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

export const getCountryByCode = (countries: Country[], code: string) => 
  (countries || []).find(c => c.code === code);

export const isCountrySupported = (countries: Country[], code: string) => 
  (countries || []).some(c => c.code === code);
