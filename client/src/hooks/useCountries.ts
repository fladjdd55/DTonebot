import { useState, useEffect } from 'react';
import { COUNTRIES as STATIC_COUNTRIES, type Country } from '../shared/countryValidator';

export { type Country };

// 🚀 DYNAMIC URL
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export function useCountries() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    const fetchCountries = async () => {
      try {
        const response = await fetch(`${BASE_URL}/api/countries`);

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
        console.warn('⚠️ Server unreachable. Using static country cache.', err);
        setCountries(STATIC_COUNTRIES);
        setUsingFallback(true);
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
