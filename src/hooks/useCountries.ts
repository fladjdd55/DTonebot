import { useState, useEffect } from 'react';

// This interface matches exactly what your server/Routes.ts returns
export interface Country {
  name: string;
  code: string;     // ISO2 (e.g., "US")
  iso3: string;     // ISO3 or fallback (e.g., "USA")
  dialCode: string; // Dialing prefix (e.g., "+1")
}

export function useCountries() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCountries = async () => {
      try {
        // Fetch from your local Node backend
        const response = await fetch('http://localhost:5000/api/countries');

        if (!response.ok) {
          throw new Error(`Failed to load countries: ${response.statusText}`);
        }

        const data = await response.json();
        setCountries(data);
      } catch (err: any) {
        console.error('Country Fetch Error:', err);
        setError(err.message || 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchCountries();
  }, []);

  return { countries, loading, error };
}
