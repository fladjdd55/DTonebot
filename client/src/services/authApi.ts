// client/src/services/authApi.ts

const API_URL = '/api/auth';

// ✅ ADDED: Export interfaces
export interface User {
  id: string;
  email: string;
  name?: string;
  phone?: string;
}

export interface Transaction {
  id: number;
  mobile: string;
  amount: number;
  currency: string;
  status: string;
  productType?: string;
  createdAt: string;
  externalId: string;
}

// Helper to handle responses
const handleResponse = async (response: Response) => {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
};

export const authApi = {
  // LOGIN
  login: async (credentials: any) => {
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    return handleResponse(response);
  },

  // REGISTER
  register: async (userData: any) => {
    const response = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    return handleResponse(response);
  },

  // LOGOUT
  logout: async () => {
    const response = await fetch(`${API_URL}/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse(response);
  },

  // GET CURRENT USER
  getCurrentUser: async () => {
    const response = await fetch(`${API_URL}/me`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse(response);
  },

  // UPDATE PROFILE
  updateProfile: async (data: any) => {
    const response = await fetch(`${API_URL}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  // CHANGE PASSWORD
  changePassword: async (data: any) => {
    const response = await fetch(`${API_URL}/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },
  
  // GET TRANSACTIONS
  getTransactions: async (page = 1) => {
    const response = await fetch(`/api/user/transactions?page=${page}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    });
    return handleResponse(response);
  }
};
