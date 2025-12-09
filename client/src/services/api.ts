export interface Product {
  id: number;
  name: string;
  description?: string;
  type: string;
  amount: string;
  currency: string;
  min: number;
  max: number;
  subserviceId?: number;
  benefits: string[];
}

// 🚀 DYNAMIC URL
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_URL = `${BASE_URL}/api`;

export const rechargeApi = {
  async lookup(mobile: string) {
    const res = await fetch(`${API_URL}/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lookup failed');
    return data;
  },

  async getProducts(operatorId: number) {
    const res = await fetch(`${API_URL}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operatorId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load products');
    return data;
  },

  // ✅ FIX: Added 'paymentId' as the 5th optional parameter
  async purchase(productId: number, mobile: string, amount: number, unit: string, type: string,  paymentId?: string) {
    const res = await fetch(`${API_URL}/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, mobile, amount, unit, type,  paymentId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Transaction failed');
    return data;
  }
};
