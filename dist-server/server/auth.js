"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = void 0;
// server/auth.ts
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("./db");
const uuid_1 = require("uuid");
const redis_1 = require("./services/redis");
const emailService_1 = require("./services/emailService");
const twoFactorService_1 = require("./services/twoFactorService");
const redis = (0, redis_1.getRedis)();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET)
    throw new Error('FATAL: JWT_SECRET must be set');
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const ENCRYPTION_KEY = process.env.REFRESH_TOKEN_ENCRYPTION_KEY || '';
// --- Helpers ---
function encrypt(text) {
    const iv = crypto_1.default.randomBytes(16);
    const cipher = crypto_1.default.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}
function decrypt(text) {
    try {
        const parts = text.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto_1.default.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (e) {
        return '';
    }
}
function generateDeviceFingerprint(device) {
    const data = `${device.ip}:${device.userAgent}`;
    return crypto_1.default.createHash('sha256').update(data).digest('hex').slice(0, 16);
}
async function checkRateLimit(userId, action) {
    const key = `ratelimit:${action}:${userId}`;
    const count = await redis.incr(key, 3600);
    const limits = { login: 10, refresh: 50, password_change: 5 };
    return count <= (limits[action] || 10);
}
// ✅ MOVED HELPER OUTSIDE: Enforce Max Sessions
async function enforceSessionLimit(userId) {
    const MAX_SESSIONS = 5;
    const count = await db_1.db.refreshToken.count({ where: { userId, revoked: false } });
    if (count >= MAX_SESSIONS) {
        const oldest = await db_1.db.refreshToken.findFirst({
            where: { userId, revoked: false },
            orderBy: { createdAt: 'asc' }
        });
        if (oldest) {
            await db_1.db.refreshToken.update({ where: { id: oldest.id }, data: { revoked: true } });
        }
    }
}
async function generateTokens(userId, email, device) {
    const fingerprint = generateDeviceFingerprint(device);
    const accessToken = jsonwebtoken_1.default.sign({ id: userId, email, fingerprint }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshTokenRaw = (0, uuid_1.v4)();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
    await db_1.db.refreshToken.create({
        data: { token: encrypt(refreshTokenRaw), userId, expiresAt }
    });
    await redis.set(`device:${userId}:${refreshTokenRaw}`, fingerprint, REFRESH_TOKEN_EXPIRY_DAYS * 86400);
    return { accessToken, refreshToken: refreshTokenRaw };
}
exports.authService = {
    async register(email, password, name, device) {
        try {
            const existing = await db_1.db.user.findUnique({ where: { email: email.toLowerCase() } });
            if (existing)
                return { success: false, error: 'Email already registered' };
            const salt = await bcryptjs_1.default.genSalt(12);
            const passwordHash = await bcryptjs_1.default.hash(password, salt);
            const user = await db_1.db.user.create({
                data: { email: email.toLowerCase(), passwordHash, name: name || null }
            });
            // Send Verification Email
            try {
                const token = await emailService_1.emailService.createVerificationToken(user.id);
                await emailService_1.emailService.sendVerificationEmail(user.email, token);
            }
            catch (e) {
                console.error("Verification email failed:", e);
            }
            const tokens = await generateTokens(user.id, user.email, device || { ip: 'unknown', userAgent: 'unknown' });
            return { success: true, user: { id: user.id, email: user.email, name: user.name, phone: user.phone }, ...tokens };
        }
        catch (error) {
            return { success: false, error: 'Registration failed' };
        }
    },
    async login(email, password, device, twoFactorToken) {
        try {
            const user = await db_1.db.user.findUnique({ where: { email: email.toLowerCase() } });
            if (!user)
                return { success: false, error: 'Invalid credentials' };
            if (!await checkRateLimit(user.id, 'login'))
                return { success: false, error: 'Too many login attempts.' };
            if (!await bcryptjs_1.default.compare(password, user.passwordHash))
                return { success: false, error: 'Invalid credentials' };
            if (user.twoFactorEnabled) {
                if (!twoFactorToken)
                    return { success: false, error: '2FA_REQUIRED' };
                const valid = await twoFactorService_1.twoFactorService.verifyToken(user.id, twoFactorToken);
                if (!valid)
                    return { success: false, error: 'Invalid 2FA code' };
            }
            // ✅ FIX: Actually call the session limiter now
            await enforceSessionLimit(user.id);
            const tokens = await generateTokens(user.id, user.email, device || { ip: 'unknown', userAgent: 'unknown' });
            return { success: true, user: { id: user.id, email: user.email, name: user.name, phone: user.phone }, ...tokens };
        }
        catch (error) {
            return { success: false, error: 'Login failed' };
        }
    },
    async refreshToken(token, device) {
        try {
            const allTokens = await db_1.db.refreshToken.findMany({ where: { revoked: false }, include: { user: true } });
            let storedToken = null;
            for (const t of allTokens) {
                if (decrypt(t.token) === token) {
                    storedToken = t;
                    break;
                }
            }
            if (!storedToken || new Date() > storedToken.expiresAt)
                return { success: false, error: 'Invalid token' };
            const userId = storedToken.userId;
            if (!await checkRateLimit(userId, 'refresh'))
                return { success: false, error: 'Too many refresh attempts' };
            const newTokens = await generateTokens(userId, storedToken.user.email, device);
            await db_1.db.refreshToken.update({ where: { id: storedToken.id }, data: { revoked: true } });
            await redis.del(`device:${userId}:${token}`);
            return { success: true, ...newTokens, user: { id: storedToken.user.id, email: storedToken.user.email, name: storedToken.user.name, phone: storedToken.user.phone } };
        }
        catch (error) {
            return { success: false, error: 'Refresh failed' };
        }
    },
    async changePassword(userId, current, newPass) {
        const user = await db_1.db.user.findUnique({ where: { id: userId } });
        if (!user || !await bcryptjs_1.default.compare(current, user.passwordHash))
            return { success: false, error: 'Incorrect password' };
        const hash = await bcryptjs_1.default.hash(newPass, 12);
        await db_1.db.user.update({ where: { id: userId }, data: { passwordHash: hash } });
        await db_1.db.refreshToken.updateMany({ where: { userId }, data: { revoked: true } });
        return { success: true };
    }
};
