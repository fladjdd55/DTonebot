// client/src/services/authApi.ts

import { getAccessToken } from './api';

const API_URL = '/api/auth';

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

const handleResponse = async (response: Response) => {
  const data = await response.json();
  if (!response.ok) {
    // Pass specific error codes (like 2FA_REQUIRED) through to the UI
    throw new Error(data.error || 'Request failed');
  }
  return data;
};

const getAuthHeaders = (): Record<string, string> => {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

export const authApi = {
  // ✅ UPDATED: Login now accepts twoFactorToken
  login: async (credentials: { email: string; password: string; twoFactorToken?: string }) => {
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(credentials),
    });
    return handleResponse(response);
  },

  register: async (userData: { email: string; password: string; name?: string }) => {
    const response = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(userData),
    });
    return handleResponse(response);
  },

  logout: async () => {
    const response = await fetch(`${API_URL}/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    return handleResponse(response);
  },

  getCurrentUser: async () => {
    const response = await fetch(`${API_URL}/me`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    return handleResponse(response);
  },

  updateProfile: async (data: { name?: string; phone?: string }) => {
    const response = await fetch(`${API_URL}/profile`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  changePassword: async (data: { currentPassword: string; newPassword: string }) => {
    const response = await fetch(`${API_URL}/change-password`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },
  
  getTransactions: async (page = 1) => {
    const response = await fetch(`/api/user/transactions?page=${page}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    return handleResponse(response);
  },

  // ✅ NEW: Verify Email
  verifyEmail: async (token: string) => {
    const response = await fetch(`${API_URL}/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    return handleResponse(response);
  },

  // ✅ NEW: Forgot Password
  forgotPassword: async (email: string) => {
    const response = await fetch(`${API_URL}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return handleResponse(response);
  },

  // ✅ NEW: Reset Password
  resetPassword: async (token: string, password: string) => {
    const response = await fetch(`${API_URL}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    return handleResponse(response);
  }
};
