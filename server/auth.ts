// server/auth.ts

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('FATAL: JWT_SECRET must be set');

const ACCESS_TOKEN_EXPIRY = '15m'; 
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export interface AuthResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
  };
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

// Helper to generate both tokens
const generateTokens = async (userId: string, email: string) => {
  const accessToken = jwt.sign(
    { id: userId, email }, 
    JWT_SECRET!, 
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const refreshToken = uuidv4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await db.refreshToken.create({
    data: {
      token: refreshToken,
      userId: userId,
      expiresAt: expiresAt
    }
  });

  return { accessToken, refreshToken };
};

export const authService = {
  async register(email: string, password: string, name?: string): Promise<AuthResult> {
    try {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) return { success: false, error: 'Invalid email' };
      if (password.length < 8) return { success: false, error: 'Password too short' };

      const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) return { success: false, error: 'Email already registered' };

      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(password, salt);

      const user = await db.user.create({
        data: { email: email.toLowerCase(), passwordHash, name: name || null }
      });

      const tokens = await generateTokens(user.id, user.email);

      return {
        success: true,
        user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
        ...tokens
      };
    } catch (error) {
      console.error('[Auth] Register error:', error);
      return { success: false, error: 'Registration failed' };
    }
  },

  async login(email: string, password: string): Promise<AuthResult> {
    try {
      const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
      if (!user) return { success: false, error: 'Invalid credentials' };

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) return { success: false, error: 'Invalid credentials' };

      const tokens = await generateTokens(user.id, user.email);

      return {
        success: true,
        user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
        ...tokens
      };
    } catch (error) {
      console.error('[Auth] Login error:', error);
      return { success: false, error: 'Login failed' };
    }
  },

  async refreshToken(token: string): Promise<AuthResult> {
    try {
      const storedToken = await db.refreshToken.findUnique({
        where: { token },
        include: { user: true }
      });

      if (!storedToken || storedToken.revoked || new Date() > storedToken.expiresAt) {
        return { success: false, error: 'Invalid refresh token' };
      }

      await db.refreshToken.update({
        where: { id: storedToken.id },
        data: { revoked: true }
      });

      const newTokens = await generateTokens(storedToken.userId, storedToken.user.email);
      return { success: true, ...newTokens };

    } catch (error) {
      return { success: false, error: 'Refresh failed' };
    }
  },

  async revokeToken(token: string) {
    try {
      await db.refreshToken.update({ where: { token }, data: { revoked: true } });
      return { success: true };
    } catch (e) { return { success: false }; }
  },

  // ✅ FIX: Added ': Promise<AuthResult>' return type
  async updateProfile(userId: string, data: { name?: string; phone?: string }): Promise<AuthResult> {
    const user = await db.user.update({ where: { id: userId }, data });
    return { success: true, user: { id: user.id, email: user.email, name: user.name, phone: user.phone } };
  },

  // ✅ FIX: Added ': Promise<AuthResult>' return type
  async changePassword(userId: string, current: string, newPass: string): Promise<AuthResult> {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return { success: false, error: 'User not found' };
    
    const isValid = await bcrypt.compare(current, user.passwordHash);
    if (!isValid) return { success: false, error: 'Incorrect password' };

    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(newPass, salt);
    await db.user.update({ where: { id: userId }, data: { passwordHash: hash } });
    
    return { success: true };
  }
};
