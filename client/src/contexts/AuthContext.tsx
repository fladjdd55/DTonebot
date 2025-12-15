// client/src/contexts/AuthContext.tsx

import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi, User } from '../services/authApi';
import { setAccessToken } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentials: any) => Promise<void>;
  register: (userData: any) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: any) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize: Check if user is already logged in (via Cookie)
  useEffect(() => {
    const initAuth = async () => {
      try {
        const data = await authApi.getCurrentUser();
        if (data.user) {
          setUser(data.user);
        }
      } catch (error) {
        // Not logged in, that's fine
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    initAuth();
  }, []);

  const login = async (credentials: any) => {
    // ✅ Fix: Pass object { email, password }
    const { user, accessToken } = await authApi.login(credentials);
    setUser(user);
    if (accessToken) setAccessToken(accessToken);
  };

  const register = async (userData: any) => {
    // ✅ Fix: Pass object { email, password, name }
    const { user, accessToken } = await authApi.register(userData);
    setUser(user);
    if (accessToken) setAccessToken(accessToken);
  };

  const logout = async () => {
    await authApi.logout();
    setAccessToken(null);
    setUser(null);
  };

  const updateProfile = async (data: any) => {
    // ✅ Fix: Pass object { name, phone }
    const { user: updatedUser } = await authApi.updateProfile(data);
    setUser(updatedUser);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
