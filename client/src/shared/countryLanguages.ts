// Map Country Code (2 letters) -> Language Code (2 letters)
// Default fallback should be 'en' in your logic if a key is missing.

export const COUNTRY_TO_LANGUAGE: Record<string, string> = {
  // North America
  'US': 'en', // USA
  'CA': 'en', // Canada (could also be fr, but usually en for API)
  'MX': 'es', // Mexico

  // South America
  'AR': 'es', // Argentina
  'BO': 'es', // Bolivia
  'BR': 'pt', // Brazil
  'CL': 'es', // Chile
  'CO': 'es', // Colombia
  'EC': 'es', // Ecuador
  'PE': 'es', // Peru
  'VE': 'es', // Venezuela
  'PY': 'es', // Paraguay
  'UY': 'es', // Uruguay

  // Europe
  'ES': 'es', // Spain
  'FR': 'fr', // France
  'DE': 'de', // Germany
  'IT': 'it', // Italy
  'PT': 'pt', // Portugal
  'RU': 'ru', // Russia
  'UA': 'ru', // Ukraine (or uk)
  'TR': 'tr', // Turkey
  'RO': 'ro', // Romania
  'PL': 'pl', // Poland

  // Africa
  'SN': 'fr', // Senegal
  'CI': 'fr', // Ivory Coast
  'CM': 'fr', // Cameroon
  'MA': 'fr', // Morocco
  'TN': 'fr', // Tunisia
  'NG': 'en', // Nigeria
  'GH': 'en', // Ghana
  'KE': 'en', // Kenya
  'ZA': 'en', // South Africa
  'EG': 'ar', // Egypt

  // Asia
  'CN': 'zh', // China
  'IN': 'en', // India (API often prefers EN over Hindi)
  'ID': 'id', // Indonesia
  'PH': 'en', // Philippines (Tagalog 'tl' often not supported by global APIs, EN is safer)
  'VN': 'vi', // Vietnam
  'TH': 'th', // Thailand
  'MY': 'en', // Malaysia
  'BD': 'bn', // Bangladesh
  'PK': 'en', // Pakistan

  // Caribbean
  'DO': 'es', // Dominican Republic
  'CU': 'es', // Cuba
  'HT': 'fr', // Haiti
  'JM': 'en', // Jamaica
};

export const getLanguageForCountry = (countryCode: string): string => {
  const code = countryCode.toUpperCase();
  return COUNTRY_TO_LANGUAGE[code] || 'en'; // Default to English if unknown
};
