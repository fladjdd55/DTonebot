// client/src/services/api.ts

export interface Product {
  id: number;
  name: string;
  description?: string;
  type: string;
  serviceId: number;      
  subserviceId?: number;     
  amount: string;         // Note: Prisma returns this as a number usually, but string is safe for display
  currency: string;
  
  // ✅ FIXED: Matched DB fields (was 'min' and 'max')
  minAmount?: number;
  maxAmount?: number;
  
  benefits: string[];
  isRanged?: boolean;
}

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_URL = `${BASE_URL}/api`;

const REQUEST_TIMEOUT_MS = 90000;

// ==================================================================
// 🔐 TOKEN MANAGEMENT (In-Memory)
// ==================================================================
let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;

// ==================================================================
// 🌐 SMART FETCH (Handles Auth + Refresh + Timeout)
// ==================================================================
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const signal = options.signal || controller.signal;

  const config: RequestInit = {
    ...options,
    headers,
    signal,
    credentials: 'include', 
  };

  try {
    let response = await fetch(url, config);
    clearTimeout(id);

    if (response.status === 401) {
      try {
        const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include' 
        });

        if (refreshRes.ok) {
          const data = await refreshRes.json();
          if (data.accessToken) {
            setAccessToken(data.accessToken);
            headers.set('Authorization', `Bearer ${data.accessToken}`);
            const retryConfig = { ...config, headers };
            response = await fetch(url, retryConfig);
          } else {
            throw new Error('No access token returned');
          }
        } else {
          throw new Error('Refresh failed');
        }
      } catch (err) {
        setAccessToken(null);
        window.location.href = '/login'; 
        return response; 
      }
    }

    return response;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('Network timeout. The server took too long to respond.');
    }
    throw error;
  }
}

// ==================================================================
// 🚀 API METHODS
// ==================================================================

export const rechargeApi = {
  async lookup(mobile: string) {
    const res = await fetchWithAuth(`${API_URL}/lookup`, {
      method: 'POST',
      body: JSON.stringify({ mobile })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lookup failed');
    return data;
  },

  async getProducts(operatorId: number, currency?: string, ranged?: boolean) {
    const params = new URLSearchParams();
    params.append('operatorId', operatorId.toString());
    
    if (currency) params.append('currency', currency);
    if (ranged) params.append('ranged', 'true');

    const res = await fetchWithAuth(`${API_URL}/products?${params.toString()}`, {
      method: 'GET'
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load products');
    return data;
  },

  async createPaymentIntent(data: { productId: number; mobile: string; type: string; customAmount?: number; countryCode?: string }, idempotencyKey?: string) {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;

    const res = await fetchWithAuth(`${API_URL}/create-payment-intent`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to create payment intent');
    return result;
  },

  async purchase(productId: number, mobile: string, amount: number, unit: string, type: string, paymentId?: string) {
    const res = await fetchWithAuth(`${API_URL}/purchase`, {
      method: 'POST',
      body: JSON.stringify({ productId, mobile, amount, unit, type, paymentId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Transaction failed');
    return data;
  },

  async checkStatus(paymentId: string) {
    const res = await fetchWithAuth(`${API_URL}/transaction/${paymentId}`, {
      method: 'GET'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to check status');
    return data;
  }
};
