import { useState, useEffect } from 'react';
import { OPERATORS as STATIC_OPERATORS, type Operator } from '../shared/operatorList';

// 🚀 DYNAMIC URL
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export function useOperators(countryCode?: string) {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    const fetchOperators = async () => {
      if (!countryCode) return;
      
      setLoading(true);
      try {
        const response = await fetch(`${BASE_URL}/api/operators?country=${countryCode}`);
        if (!response.ok) throw new Error('API Error');
        const data = await response.json();
        setOperators(data);
        setUsingFallback(false);
      } catch (err) {
        console.warn('⚠️ API Offline. Using local operator list.');
        // Filter local list safely
        const list = Array.isArray(STATIC_OPERATORS) ? STATIC_OPERATORS : [];
        const filtered = list.filter(op => op.countryCode === countryCode);
        setOperators(filtered);
        setUsingFallback(true);
      } finally {
        setLoading(false);
      }
    };

    fetchOperators();
  }, [countryCode]);

  return { operators, loading, usingFallback };
}
