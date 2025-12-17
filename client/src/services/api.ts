export interface Product {
  id: number;
  name: string;
  description?: string;
  type: string;
  serviceId: number;      // 1=Mobile, 4=GiftCards, 3=Utilities
  subserviceId?: number;     // 11=Airtime, 12=Bundle, 13=Data, 41=Retail...
  amount: string;
  currency: string;
  min: number;
  max: number;
  benefits: string[];
  costPrice?: number;         // Fixed cost OR min cost for ranged
  costPriceMin?: number;      // Min USD cost (for RANGED products)
  costPriceMax?: number;      // Max USD cost (for RANGED products)
  costCurrency?: string;
  // ✅ Helper flag
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
  // 1. Prepare Headers (Attach Token if exists)
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  // 2. Prepare Config (Timeout + Credentials)
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const signal = options.signal || controller.signal;

  const config: RequestInit = {
    ...options,
    headers,
    signal,
    credentials: 'include', // ✅ Critical: Sends Cookies (Refresh Token)
  };

  try {
    let response = await fetch(url, config);
    clearTimeout(id);

    // 3. 🔄 INTERCEPT 401: Attempt Token Refresh
    if (response.status === 401) {
      try {
        // Call Refresh Endpoint (Uses HttpOnly Cookie)
        const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include' 
        });

        if (refreshRes.ok) {
          const data = await refreshRes.json();
          if (data.accessToken) {
            // ✅ Success: Update Memory Token & Retry Original Request
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
        // ❌ Refresh Failed: Force Logout
        setAccessToken(null);
        window.location.href = '/login'; // Redirect to login
        return response; // Return original 401 so caller knows it failed
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
