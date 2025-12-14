const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_URL = `${BASE_URL}/api`;

// Token storage keys
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

export interface User {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  message?: string;
  error?: string;
}

export interface Transaction {
  id: number;
  mobile: string;
  amount: number;
  currency: string;
  status: string;
  productType: string | null;
  createdAt: string;
  externalId: string;
}

export interface TransactionResponse {
  transactions: Transaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Helper to get stored token
export const getStoredToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

// Helper to get stored user
export const getStoredUser = (): User | null => {
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

// Helper to store auth data
const storeAuth = (token: string, user: User) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

// Helper to clear auth data
export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

// Auth headers helper
const authHeaders = (token?: string): HeadersInit => {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const authToken = token || getStoredToken();
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
};

export const authApi = {
  /**
   * Register a new user
   */
  async register(email: string, password: string, name?: string): Promise<AuthResponse> {
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      });

      const data = await res.json();

      if (!res.ok) {
        return { 
          success: false, 
          error: data.error || data.details?.join(', ') || 'Registration failed' 
        };
      }

      // Store auth data
      if (data.token && data.user) {
        storeAuth(data.token, data.user);
      }

      return {
        success: true,
        user: data.user,
        token: data.token,
        message: data.message
      };

    } catch (error: any) {
      console.error('[Auth] Register error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  },

  /**
   * Login user
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        return { 
          success: false, 
          error: data.error || 'Login failed' 
        };
      }

      // Store auth data
      if (data.token && data.user) {
        storeAuth(data.token, data.user);
      }

      return {
        success: true,
        user: data.user,
        token: data.token,
        message: data.message
      };

    } catch (error: any) {
      console.error('[Auth] Login error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  },

  /**
   * Get current user profile
   */
  async getProfile(): Promise<AuthResponse> {
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        method: 'GET',
        headers: authHeaders()
      });

      if (!res.ok) {
        if (res.status === 401) {
          clearAuth();
          return { success: false, error: 'Session expired' };
        }
        return { success: false, error: 'Failed to get profile' };
      }

      const data = await res.json();
      return { success: true, user: data.user };

    } catch (error: any) {
      console.error('[Auth] Get profile error:', error);
      return { success: false, error: 'Network error' };
    }
  },

  /**
   * Update user profile
   */
  async updateProfile(name?: string, phone?: string): Promise<AuthResponse> {
    try {
      const res = await fetch(`${API_URL}/auth/profile`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ name, phone })
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || 'Update failed' };
      }

      // Update stored user
      const currentUser = getStoredUser();
      if (currentUser && data.user) {
        storeAuth(getStoredToken()!, data.user);
      }

      return { success: true, user: data.user };

    } catch (error: any) {
      console.error('[Auth] Update profile error:', error);
      return { success: false, error: 'Network error' };
    }
  },

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<AuthResponse> {
    try {
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || 'Password change failed' };
      }

      return { success: true, message: data.message };

    } catch (error: any) {
      console.error('[Auth] Change password error:', error);
      return { success: false, error: 'Network error' };
    }
  },

  /**
   * Get user's transaction history
   */
  async getTransactions(page: number = 1, limit: number = 20): Promise<TransactionResponse | null> {
    try {
      const res = await fetch(`${API_URL}/user/transactions?page=${page}&limit=${limit}`, {
        method: 'GET',
        headers: authHeaders()
      });

      if (!res.ok) {
        console.error('[Auth] Get transactions failed');
        return null;
      }

      return await res.json();

    } catch (error: any) {
      console.error('[Auth] Get transactions error:', error);
      return null;
    }
  },

  /**
   * Logout - clears local storage
   */
  logout() {
    clearAuth();
  }
};
