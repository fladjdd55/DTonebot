// client/src/services/api.ts
const API_URL = 'http://localhost:5000/api';

export const rechargeApi = {
  // Step 4 in Diagram: Call Mobile Number Lookup
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

  // Step 5 in Diagram: Get Products
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

  // Final Step: Purchase
  async purchase(productId: number, mobile: string, amount: number) {
    const res = await fetch(`${API_URL}/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, mobile, amount })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Transaction failed');
    return data;
  }
};
