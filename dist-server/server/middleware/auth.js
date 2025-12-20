"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.optionalAuth = optionalAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
const redis_1 = require("../services/redis");
const redis = (0, redis_1.getRedis)();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET must be set in environment variables');
}
const SECRET = JWT_SECRET;
async function requireAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        const cookieToken = req.cookies?.auth_token;
        const token = cookieToken || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const decoded = jsonwebtoken_1.default.verify(token, SECRET);
        const user = await db_1.db.user.findUnique({ where: { id: decoded.id } });
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        // ✅ FIXED: Redis Rate Limiting
        // We pass the TTL (3600s) directly to incr() so the RedisService handles it atomically.
        const userKey = `ratelimit:user:${user.id}`;
        try {
            const count = await redis.incr(userKey, 3600);
            if (count > 200) {
                console.warn(`[RateLimit] User ${user.id} exceeded limit (${count}/200)`);
                return res.status(429).json({ error: 'Too many requests. Please try again in an hour.' });
            }
        }
        catch (redisError) {
            console.error("[RateLimit] Redis error:", redisError);
            // Fail open (allow request) if Redis is down
        }
        req.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            phone: user.phone
        };
        next();
    }
    catch (error) {
        if (error.name === 'TokenExpiredError')
            return res.status(401).json({ error: 'Token expired' });
        if (error.name === 'JsonWebTokenError')
            return res.status(401).json({ error: 'Invalid token' });
        return res.status(401).json({ error: 'Authentication failed' });
    }
}
async function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        const cookieToken = req.cookies?.auth_token;
        const token = cookieToken || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);
        if (token) {
            const decoded = jsonwebtoken_1.default.verify(token, SECRET);
            const user = await db_1.db.user.findUnique({ where: { id: decoded.id } });
            if (user) {
                req.user = {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    phone: user.phone
                };
            }
        }
        next();
    }
    catch (error) {
        next();
    }
}
