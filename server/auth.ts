// server/auth.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from './db';
import { v4 as uuidv4 } from 'uuid';
import { getRedis } from './services/redis';
import { emailService } from './services/emailService';
import { twoFactorService } from './services/twoFactorService';

const redis = getRedis();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('FATAL: JWT_SECRET must be set');

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const ENCRYPTION_KEY = process.env.REFRESH_TOKEN_ENCRYPTION_KEY || '';

// --- Helpers ---

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) { return ''; }
}

interface DeviceInfo { ip: string; userAgent: string; }

function generateDeviceFingerprint(device: DeviceInfo): string {
  const data = `${device.ip}:${device.userAgent}`;
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

async function checkRateLimit(userId: string, action: string): Promise<boolean> {
  const key = `ratelimit:${action}:${userId}`;
  const count = await redis.incr(key, 3600);
  const limits: Record<string, number> = { login: 10, refresh: 50, password_change: 5 };
  return count <= (limits[action] || 10);
}

// ✅ MOVED HELPER OUTSIDE: Enforce Max Sessions
async function enforceSessionLimit(userId: string) {
  const MAX_SESSIONS = 5;
  const count = await db.refreshToken.count({ where: { userId, revoked: false } });

  if (count >= MAX_SESSIONS) {
    const oldest = await db.refreshToken.findFirst({
      where: { userId, revoked: false },
      orderBy: { createdAt: 'asc' }
    });
    if (oldest) {
      await db.refreshToken.update({ where: { id: oldest.id }, data: { revoked: true } });
    }
  }
}

async function generateTokens(userId: string, email: string, device: DeviceInfo) {
  const fingerprint = generateDeviceFingerprint(device);
  const accessToken = jwt.sign({ id: userId, email, fingerprint }, JWT_SECRET!, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshTokenRaw = uuidv4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await db.refreshToken.create({
    data: { token: encrypt(refreshTokenRaw), userId, expiresAt }
  });

  await redis.set(`device:${userId}:${refreshTokenRaw}`, fingerprint, REFRESH_TOKEN_EXPIRY_DAYS * 86400);
  return { accessToken, refreshToken: refreshTokenRaw };
}

export interface AuthResult {
  success: boolean;
  user?: { id: string; email: string; name: string | null; phone: string | null; };
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

export const authService = {
  async register(email: string, password: string, name?: string, device?: DeviceInfo): Promise<AuthResult> {
    try {
      const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) return { success: false, error: 'Email already registered' };

      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(password, salt);

      const user = await db.user.create({
        data: { email: email.toLowerCase(), passwordHash, name: name || null }
      });

      // Send Verification Email
      try {
        const token = await emailService.createVerificationToken(user.id);
        await emailService.sendVerificationEmail(user.email, token);
      } catch (e) { console.error("Verification email failed:", e); }

      const tokens = await generateTokens(user.id, user.email, device || { ip: 'unknown', userAgent: 'unknown' });

      return { success: true, user: { id: user.id, email: user.email, name: user.name, phone: user.phone }, ...tokens };
    } catch (error) { return { success: false, error: 'Registration failed' }; }
  },

  async login(email: string, password: string, device?: DeviceInfo, twoFactorToken?: string): Promise<AuthResult> {
    try {
      const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
      if (!user) return { success: false, error: 'Invalid credentials' };

      if (!await checkRateLimit(user.id, 'login')) return { success: false, error: 'Too many login attempts.' };

      if (!await bcrypt.compare(password, user.passwordHash)) return { success: false, error: 'Invalid credentials' };
      
      if (user.twoFactorEnabled) {
         if (!twoFactorToken) return { success: false, error: '2FA_REQUIRED' };
         const valid = await twoFactorService.verifyToken(user.id, twoFactorToken);
         if (!valid) return { success: false, error: 'Invalid 2FA code' };
      }

      // ✅ FIX: Actually call the session limiter now
      await enforceSessionLimit(user.id);

      const tokens = await generateTokens(user.id, user.email, device || { ip: 'unknown', userAgent: 'unknown' });

      return { success: true, user: { id: user.id, email: user.email, name: user.name, phone: user.phone }, ...tokens };
    } catch (error) { return { success: false, error: 'Login failed' }; }
  },

  async refreshToken(token: string, device: DeviceInfo): Promise<AuthResult> {
    try {
      const allTokens = await db.refreshToken.findMany({ where: { revoked: false }, include: { user: true } });
      let storedToken = null;
      for (const t of allTokens) {
        if (decrypt(t.token) === token) { storedToken = t; break; }
      }

      if (!storedToken || new Date() > storedToken.expiresAt) return { success: false, error: 'Invalid token' };

      const userId = storedToken.userId;
      if (!await checkRateLimit(userId, 'refresh')) return { success: false, error: 'Too many refresh attempts' };

      const newTokens = await generateTokens(userId, storedToken.user.email, device);

      await db.refreshToken.update({ where: { id: storedToken.id }, data: { revoked: true } });
      await redis.del(`device:${userId}:${token}`);

      return { success: true, ...newTokens, user: { id: storedToken.user.id, email: storedToken.user.email, name: storedToken.user.name, phone: storedToken.user.phone } };
    } catch (error) { return { success: false, error: 'Refresh failed' }; }
  },

  async changePassword(userId: string, current: string, newPass: string): Promise<AuthResult> {
     const user = await db.user.findUnique({ where: { id: userId } });
     if (!user || !await bcrypt.compare(current, user.passwordHash)) return { success: false, error: 'Incorrect password' };
     
     const hash = await bcrypt.hash(newPass, 12);
     await db.user.update({ where: { id: userId }, data: { passwordHash: hash } });
     await db.refreshToken.updateMany({ where: { userId }, data: { revoked: true } });
     return { success: true };
  }
};
