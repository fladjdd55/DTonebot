// client/src/hooks/useProducts.ts
import { useState, useEffect } from 'react';
import { api } from '../services/api'; // Your axios instance

export function useProducts(operatorId: number | null, currency?: string) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!operatorId) return;

    const fetchProducts = async () => {
      setLoading(true);
      try {
        // Pass currency to the backend
        const params: any = { operatorId };
        if (currency) params.currency = currency;

        const res = await api.get('/products', { params });
        setProducts(res.data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [operatorId, currency]); // ✅ Re-runs when currency changes

  return { products, loading };
}
