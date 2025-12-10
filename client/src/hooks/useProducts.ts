// client/src/hooks/useProducts.ts

import { useState, useEffect } from 'react';
import { rechargeApi, Product } from '../services/api'; // ✅ Correct Import

export function useProducts(operatorId: number | null, currency?: string, ranged?: boolean) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset if no operator selected
    if (!operatorId) {
      setProducts([]);
      return;
    }

    const fetchProducts = async () => {
      setLoading(true);
      setError(null);
      try {
        // ✅ FIX: Use rechargeApi instead of 'api'
        const data = await rechargeApi.getProducts(operatorId, currency, ranged);
        setProducts(data);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to load products');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [operatorId, currency, ranged]); // ✅ Re-runs automatically when filters change

  return { products, loading, error };
}
