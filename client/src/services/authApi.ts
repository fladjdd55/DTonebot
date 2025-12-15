// client/src/services/authApi.ts

import { getAccessToken } from './api';

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

// ✅ Helper to get auth headers
const getAuthHeaders = (): Record<string, string> => {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

export const authApi = {
  // LOGIN
  login: async (credentials: { email: string; password: string }) => {
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // ✅ Required for cookies
      body: JSON.stringify(credentials),
    });
    return handleResponse(response);
  },

  // REGISTER
  register: async (userData: { email: string; password: string; name?: string }) => {
    const response = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // ✅ Required for cookies
      body: JSON.stringify(userData),
    });
    return handleResponse(response);
  },

  // LOGOUT
  logout: async () => {
    const response = await fetch(`${API_URL}/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include', // ✅ Required for cookies
    });
    return handleResponse(response);
  },

  // GET CURRENT USER
  getCurrentUser: async () => {
    const response = await fetch(`${API_URL}/me`, {
      method: 'GET',
      headers: getAuthHeaders(), // ✅ Fixed: Now includes token
      credentials: 'include',    // ✅ Required for cookies
    });
    return handleResponse(response);
  },

  // UPDATE PROFILE
  updateProfile: async (data: { name?: string; phone?: string }) => {
    const response = await fetch(`${API_URL}/profile`, {
      method: 'PUT',
      headers: getAuthHeaders(), // ✅ Fixed: Now includes token
      credentials: 'include',
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  // CHANGE PASSWORD
  changePassword: async (data: { currentPassword: string; newPassword: string }) => {
    const response = await fetch(`${API_URL}/change-password`, {
      method: 'POST',
      headers: getAuthHeaders(), // ✅ Fixed: Now includes token
      credentials: 'include',
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },
  
  // GET TRANSACTIONS
  getTransactions: async (page = 1) => {
    const response = await fetch(`/api/user/transactions?page=${page}`, {
      method: 'GET',
      headers: getAuthHeaders(), // ✅ Fixed: Now includes token
      credentials: 'include',
    });
    return handleResponse(response);
  }
};

