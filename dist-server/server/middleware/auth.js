"use strict";
// server/middleware/auth.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.optionalAuth = optionalAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
// ✅ SECURITY: Fail fast if JWT_SECRET is missing
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET must be set in environment variables');
}
// ✅ TypeScript now knows JWT_SECRET is definitely a string
const SECRET = JWT_SECRET;
async function requireAuth(req, res, next) {
    try {
        // Support both Bearer Token (Header) AND Cookie
        const authHeader = req.headers.authorization;
        const cookieToken = req.cookies?.auth_token;
        const token = cookieToken || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        // ✅ FIX: Use SECRET (guaranteed string) and cast through unknown
        const decoded = jsonwebtoken_1.default.verify(token, SECRET);
        // Fetch user to ensure they exist
        const user = await db_1.db.user.findUnique({ where: { id: decoded.id } });
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
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
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        return res.status(401).json({ error: 'Authentication failed' });
    }
}
async function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        const cookieToken = req.cookies?.auth_token;
        const token = cookieToken || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);
        if (token) {
            // ✅ FIX: Use SECRET (guaranteed string) and cast through unknown
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
        // Token invalid/expired - continue as guest
        next();
    }
}
