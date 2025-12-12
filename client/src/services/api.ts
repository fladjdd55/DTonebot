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

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_URL = `${BASE_URL}/api`;

// ✅ FIX: Define a reasonable timeout (e.g., 90s)
const REQUEST_TIMEOUT_MS = 90000;

/**
 * Helper to wrap fetch with a timeout
 */
async function fetchWithTimeout(resource: string, options: RequestInit = {}) {
  const { signal, ...rest } = options;
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  
  // Allow passing an external signal if needed, otherwise use our controller
  const requestSignal = signal || controller.signal;

  try {
    const response = await fetch(resource, {
      ...rest,
      signal: requestSignal
    });
    clearTimeout(id);
    return response;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('Network timeout. The server took too long to respond.');
    }
    throw error;
  }
}

export const rechargeApi = {
  async lookup(mobile: string) {
    const res = await fetchWithTimeout(`${API_URL}/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lookup failed');
    return data;
  },

  // ✅ UPDATED: Uses GET and Query Strings
  async getProducts(operatorId: number, currency?: string, ranged?: boolean) {
    const params = new URLSearchParams();
    params.append('operatorId', operatorId.toString());
    
    if (currency) params.append('currency', currency);
    if (ranged) params.append('ranged', 'true');

    const res = await fetchWithTimeout(`${API_URL}/products?${params.toString()}`, {
      method: 'GET', // ✅ Must match Backend
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load products');
    return data;
  },

  async purchase(productId: number, mobile: string, amount: number, unit: string, type: string,  paymentId?: string) {
    const res = await fetchWithTimeout(`${API_URL}/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, mobile, amount, unit, type,  paymentId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Transaction failed');
    return data;
  },

  // ✅ NEW METHOD: Check Transaction Status (Fixes your TS Error)
  async checkStatus(paymentId: string) {
    const res = await fetchWithTimeout(`${API_URL}/transaction/${paymentId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to check status');
    return data;
  }
};
