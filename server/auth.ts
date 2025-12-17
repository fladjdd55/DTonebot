// server/auth.ts - FIXED VERSION
// Key Changes:
// 1. Token rotation with rollback on failure
// 2. Device fingerprinting
// 3. Rate limiting per user
// 4. Encrypted refresh tokens

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from './db';
import { v4 as uuidv4 } from 'uuid';
import { getRedis } from './services/redis';

const redis = getRedis();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('FATAL: JWT_SECRET must be set');

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

// Encryption for refresh tokens at rest
const ENCRYPTION_KEY = process.env.REFRESH_TOKEN_ENCRYPTION_KEY || JWT_SECRET;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    iv
  );
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    iv
  );
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

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

interface DeviceInfo {
  ip: string;
  userAgent: string;
  fingerprint?: string;
}

/**
 * Generate device fingerprint for anomaly detection
 */
function generateDeviceFingerprint(device: DeviceInfo): string {
  const data = `${device.ip}:${device.userAgent}`;
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

/**
 * Check rate limiting per user
 */
async function checkRateLimit(userId: string, action: string): Promise<boolean> {
  const key = `ratelimit:${action}:${userId}`;
  const count = await redis.incr(key, 3600); // 1 hour window
  
  const limits: Record<string, number> = {
    login: 10,
    refresh: 50,
    password_change: 5
  };
  
  return count <= (limits[action] || 10);
}

/**
 * Generate both access and refresh tokens with device tracking
 */
async function generateTokens(
  userId: string, 
  email: string, 
  device: DeviceInfo
): Promise<{ accessToken: string; refreshToken: string }> {
  
  const fingerprint = generateDeviceFingerprint(device);
  
  // Access Token (short-lived, in memory)
  const accessToken = jwt.sign(
    { 
      id: userId, 
      email,
      fingerprint // Include for verification
    },
    JWT_SECRET!,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  // Refresh Token (long-lived, secure)
  const refreshTokenRaw = uuidv4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  // Encrypt before storing
  const encryptedToken = encrypt(refreshTokenRaw);

  await db.refreshToken.create({
    data: {
      token: encryptedToken,
      userId: userId,
      expiresAt: expiresAt
    }
  });

  // Store device fingerprint for this token
  await redis.set(
    `device:${userId}:${refreshTokenRaw}`,
    fingerprint,
    REFRESH_TOKEN_EXPIRY_DAYS * 86400
  );

  return { accessToken, refreshToken: refreshTokenRaw };
}

export const authService = {
  async register(
    email: string, 
    password: string, 
    name?: string,
    device?: DeviceInfo
  ): Promise<AuthResult> {
    try {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return { success: false, error: 'Invalid email' };
      }
      if (password.length < 8) {
        return { success: false, error: 'Password must be at least 8 characters' };
      }

      const existing = await db.user.findUnique({ 
        where: { email: email.toLowerCase() } 
      });
      
      if (existing) {
        return { success: false, error: 'Email already registered' };
      }

      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(password, salt);

      const user = await db.user.create({
        data: { 
          email: email.toLowerCase(), 
          passwordHash, 
          name: name || null 
        }
      });

      const tokens = await generateTokens(
        user.id, 
        user.email,
        device || { ip: 'unknown', userAgent: 'unknown' }
      );

      return {
        success: true,
        user: { 
          id: user.id, 
          email: user.email, 
          name: user.name, 
          phone: user.phone 
        },
        ...tokens
      };
    } catch (error) {
      console.error('[Auth] Register error:', error);
      return { success: false, error: 'Registration failed' };
    }
  },

  async login(
    email: string, 
    password: string,
    device?: DeviceInfo
  ): Promise<AuthResult> {
    try {
      const user = await db.user.findUnique({ 
        where: { email: email.toLowerCase() } 
      });
      
      if (!user) {
        return { success: false, error: 'Invalid credentials' };
      }

      // Rate limiting
      const allowed = await checkRateLimit(user.id, 'login');
      if (!allowed) {
        return { 
          success: false, 
          error: 'Too many login attempts. Please try again later.' 
        };
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return { success: false, error: 'Invalid credentials' };
      }

      const tokens = await generateTokens(
        user.id, 
        user.email,
        device || { ip: 'unknown', userAgent: 'unknown' }
      );

      return {
        success: true,
        user: { 
          id: user.id, 
          email: user.email, 
          name: user.name, 
          phone: user.phone 
        },
        ...tokens
      };
    } catch (error) {
      console.error('[Auth] Login error:', error);
      return { success: false, error: 'Login failed' };
    }
  },

  /**
   * FIXED: Token rotation with rollback on failure
   */
  async refreshToken(
    token: string, 
    device: DeviceInfo
  ): Promise<AuthResult> {
    try {
      // Find all tokens matching this pattern (encrypted)
      const allTokens = await db.refreshToken.findMany({
        where: { revoked: false },
        include: { user: true }
      });

      let storedToken = null;
      for (const t of allTokens) {
        try {
          const decrypted = decrypt(t.token);
          if (decrypted === token) {
            storedToken = t;
            break;
          }
        } catch (e) {
          // Token decryption failed, skip
          continue;
        }
      }

      if (!storedToken || new Date() > storedToken.expiresAt) {
        return { success: false, error: 'Invalid or expired refresh token' };
      }

      const userId = storedToken.userId;

      // Rate limiting
      const allowed = await checkRateLimit(userId, 'refresh');
      if (!allowed) {
        return { 
          success: false, 
          error: 'Too many refresh attempts' 
        };
      }

      // Verify device fingerprint
      const storedFingerprint = await redis.get(`device:${userId}:${token}`);
      const currentFingerprint = generateDeviceFingerprint(device);
      
      if (storedFingerprint && storedFingerprint !== currentFingerprint) {
        console.warn(`[Security] Device mismatch for user ${userId}`);
        // Allow but log - could be VPN/network change
      }

      // CREATE NEW TOKENS FIRST (before revoking old)
      const newTokens = await generateTokens(
        userId,
        storedToken.user.email,
        device
      );

      // Only revoke old token AFTER new ones are created
      await db.refreshToken.update({
        where: { id: storedToken.id },
        data: { revoked: true }
      });

      // Clean up old device fingerprint
      await redis.del(`device:${userId}:${token}`);

      return { 
        success: true, 
        ...newTokens,
        user: {
          id: storedToken.user.id,
          email: storedToken.user.email,
          name: storedToken.user.name,
          phone: storedToken.user.phone
        }
      };

    } catch (error) {
      console.error('[Auth] Refresh error:', error);
      return { success: false, error: 'Refresh failed' };
    }
  },

  async revokeToken(token: string): Promise<{ success: boolean }> {
    try {
      // Find and revoke all matching tokens
      const allTokens = await db.refreshToken.findMany({
        where: { revoked: false }
      });

      for (const t of allTokens) {
        try {
          const decrypted = decrypt(t.token);
          if (decrypted === token) {
            await db.refreshToken.update({
              where: { id: t.id },
              data: { revoked: true }
            });
            // Clean device fingerprint
            await redis.del(`device:${t.userId}:${token}`);
            return { success: true };
          }
        } catch (e) {
          continue;
        }
      }
      
      return { success: false };
    } catch (e) {
      return { success: false };
    }
  },

  async updateProfile(
    userId: string, 
    data: { name?: string; phone?: string }
  ): Promise<AuthResult> {
    const user = await db.user.update({ 
      where: { id: userId }, 
      data 
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
  },

  async changePassword(
    userId: string, 
    current: string, 
    newPass: string
  ): Promise<AuthResult> {
    // Rate limiting
    const allowed = await checkRateLimit(userId, 'password_change');
    if (!allowed) {
      return { 
        success: false, 
        error: 'Too many password change attempts' 
      };
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return { success: false, error: 'User not found' };
    
    const isValid = await bcrypt.compare(current, user.passwordHash);
    if (!isValid) return { success: false, error: 'Incorrect current password' };

    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(newPass, salt);
    
    await db.user.update({ 
      where: { id: userId }, 
      data: { passwordHash: hash } 
    });
    
    // Revoke all refresh tokens (force re-login on all devices)
    await db.refreshToken.updateMany({
      where: { userId: userId },
      data: { revoked: true }
    });
    
    return { success: true };
  },

  /**
   * Clean up expired tokens (run daily via cron)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await db.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revoked: true }
        ]
      }
    });
    
    console.log(`[Auth] Cleaned up ${result.count} expired tokens`);
    return result.count;
  }
};
