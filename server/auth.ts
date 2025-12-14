// server/auth.ts

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Password requirements
const MIN_PASSWORD_LENGTH = 8;

export interface JwtPayload {
  userId: string;
  email: string;
}

export interface AuthResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
  };
  token?: string;
  error?: string;
}

export const authService = {
  /**
   * Register a new user
   */
  async register(email: string, password: string, name?: string): Promise<AuthResult> {
    try {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return { success: false, error: 'Invalid email format' };
      }

      // Validate password strength
      if (password.length < MIN_PASSWORD_LENGTH) {
        return { success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
      }

      // Check if user exists
      const existingUser = await db.user.findUnique({ where: { email: email.toLowerCase() } });
      if (existingUser) {
        return { success: false, error: 'Email already registered' };
      }

      // Hash password
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(password, salt);

      // Create user
      const user = await db.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          name: name || null
        }
      });

      // Generate token
      const token = this.generateToken(user.id, user.email);

      console.log(`[Auth] ✅ New user registered: ${user.email}`);

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone
        },
        token
      };

    } catch (error: any) {
      console.error('[Auth] Registration error:', error);
      return { success: false, error: 'Registration failed. Please try again.' };
    }
  },

  /**
   * Login user
   */
  async login(email: string, password: string): Promise<AuthResult> {
    try {
      // Find user
      const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
      if (!user) {
        return { success: false, error: 'Invalid email or password' };
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return { success: false, error: 'Invalid email or password' };
      }

      // Generate token
      const token = this.generateToken(user.id, user.email);

      console.log(`[Auth] ✅ User logged in: ${user.email}`);

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone
        },
        token
      };

    } catch (error: any) {
      console.error('[Auth] Login error:', error);
      return { success: false, error: 'Login failed. Please try again.' };
    }
  },

  /**
   * Verify JWT token and return user
   */
  async verifyToken(token: string): Promise<AuthResult> {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      
      const user = await db.user.findUnique({ where: { id: decoded.userId } });
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone
        }
      };

    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return { success: false, error: 'Token expired' };
      }
      return { success: false, error: 'Invalid token' };
    }
  },

  /**
   * Update user profile
   */
  async updateProfile(userId: string, data: { name?: string; phone?: string }): Promise<AuthResult> {
    try {
      const user = await db.user.update({
        where: { id: userId },
        data: {
          name: data.name,
          phone: data.phone
        }
      });

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone
        }
      };

    } catch (error: any) {
      console.error('[Auth] Update profile error:', error);
      return { success: false, error: 'Failed to update profile' };
    }
  },

  /**
   * Change password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<AuthResult> {
    try {
      const user = await db.user.findUnique({ where: { id: userId } });
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        return { success: false, error: 'Current password is incorrect' };
      }

      // Validate new password
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return { success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
      }

      // Hash new password
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(newPassword, salt);

      await db.user.update({
        where: { id: userId },
        data: { passwordHash }
      });

      console.log(`[Auth] ✅ Password changed for: ${user.email}`);

      return { success: true };

    } catch (error: any) {
      console.error('[Auth] Change password error:', error);
      return { success: false, error: 'Failed to change password' };
    }
  },

  /**
   * Generate JWT token
   */
  generateToken(userId: string, email: string): string {
    const payload: JwtPayload = { userId, email };
    return jwt.sign(payload, JWT_SECRET, { 
      expiresIn: JWT_EXPIRES_IN as any
    });
  }
};
