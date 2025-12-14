// client/src/contexts/AuthContext.tsx

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, User, getStoredToken, getStoredUser, clearAuth } from '../services/authApi';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateProfile: (name?: string, phone?: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = getStoredToken();
      const storedUser = getStoredUser();

      if (token && storedUser) {
        // Verify token is still valid
        const result = await authApi.getProfile();
        if (result.success && result.user) {
          setUser(result.user);
        } else {
          // Token expired or invalid
          clearAuth();
        }
      }

      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    
    if (result.success && result.user) {
      setUser(result.user);
      return { success: true };
    }
    
    return { success: false, error: result.error };
  };

  const register = async (email: string, password: string, name?: string) => {
    const result = await authApi.register(email, password, name);
    
    if (result.success && result.user) {
      setUser(result.user);
      return { success: true };
    }
    
    return { success: false, error: result.error };
  };

  const logout = () => {
    authApi.logout();
    setUser(null);
  };

  const updateProfile = async (name?: string, phone?: string) => {
    const result = await authApi.updateProfile(name, phone);
    
    if (result.success && result.user) {
      setUser(result.user);
      return { success: true };
    }
    
    return { success: false, error: result.error };
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
    updateProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
