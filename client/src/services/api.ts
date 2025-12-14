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
  costPrice?: number;
  costCurrency?: string;
}

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_URL = `${BASE_URL}/api`;

// Token storage key (must match authApi.ts)
const TOKEN_KEY = 'auth_token';

// Helper to get stored token
const getStoredToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

// Helper to build headers with optional auth
const getHeaders = (): HeadersInit => {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const token = getStoredToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

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
      headers: getHeaders(), // ✅ Include auth
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
      method: 'GET',
      headers: getHeaders() // ✅ Include auth
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load products');
    return data;
  },

  async purchase(productId: number, mobile: string, amount: number, unit: string, type: string, paymentId?: string) {
    const res = await fetchWithTimeout(`${API_URL}/purchase`, {
      method: 'POST',
      headers: getHeaders(), // ✅ Include auth - THIS IS THE KEY FIX
      body: JSON.stringify({ productId, mobile, amount, unit, type, paymentId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Transaction failed');
    return data;
  },

  // ✅ NEW METHOD: Check Transaction Status
  async checkStatus(paymentId: string) {
    const res = await fetchWithTimeout(`${API_URL}/transaction/${paymentId}`, {
      method: 'GET',
      headers: getHeaders() // ✅ Include auth
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to check status');
    return data;
  }
}
