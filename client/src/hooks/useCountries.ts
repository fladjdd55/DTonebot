import { COUNTRIES } from '../shared/countryValidator';
import type { Country } from '../shared/countryValidator';

export { type Country };

export function useCountries() {
  // ✅ FAST: Direct read from local cache file
  // No need for useState/useEffect or API calls
  
  return {
    countries: COUNTRIES,
    loading: false, // Instant
    error: null,
    usingFallback: false
  };
}
