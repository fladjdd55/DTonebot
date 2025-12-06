import { useState, useEffect } from 'react';
// Import the static list as a fallback
import { COUNTRIES as STATIC_COUNTRIES, type Country } from '../shared/countryValidator';

export { type Country };

export function useCountries() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    const fetchCountries = async () => {
      try {
        // 1. Try to fetch from the live Server API
        const response = await fetch('http://localhost:5000/api/countries');

        if (!response.ok) {
          throw new Error('Server returned error');
        }

        const data = await response.json();
        
        if (Array.isArray(data) && data.length > 0) {
          setCountries(data);
          setUsingFallback(false);
        } else {
          throw new Error('API returned empty list');
        }

      } catch (err) {
        // 2. FALLBACK: If Server is offline or fails, use the static file
        console.warn('⚠️ Server unreachable. Using static country cache.', err);
        setCountries(STATIC_COUNTRIES);
        setUsingFallback(true);
        
        // We don't set 'error' here because the app is still working!
        // Only set error if even the static list is empty
        if (STATIC_COUNTRIES.length === 0) {
          setError('Could not load countries (Server offline & Cache empty)');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchCountries();
  }, []);

  return { countries, loading, error, usingFallback };
}
