"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const auth_1 = require("../auth");
const auth_2 = require("../middleware/auth");
const router = (0, express_1.Router)();
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many login attempts" }
});
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    name: zod_1.z.string().min(1).optional()
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1)
});
const getDeviceInfo = (req) => ({
    ip: req.ip || req.socket.remoteAddress || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown'
});
router.post('/register', authLimiter, async (req, res) => {
    try {
        const { email, password, name } = registerSchema.parse(req.body);
        const result = await auth_1.authService.register(email, password, name, getDeviceInfo(req));
        if (!result.success)
            return res.status(400).json({ error: result.error });
        res.cookie('refresh_token', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/api/auth/refresh',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        return res.status(201).json({ user: result.user, accessToken: result.accessToken });
    }
    catch {
        return res.status(400).json({ error: 'Registration failed' });
    }
});
router.post('/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = loginSchema.parse(req.body);
        const result = await auth_1.authService.login(email, password, getDeviceInfo(req));
        if (!result.success)
            return res.status(401).json({ error: result.error });
        res.cookie('refresh_token', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/api/auth/refresh',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        return res.json({ user: result.user, accessToken: result.accessToken });
    }
    catch {
        return res.status(500).json({ error: 'Login failed' });
    }
});
router.post('/refresh', async (req, res) => {
    const refreshToken = req.cookies.refresh_token;
    if (!refreshToken)
        return res.sendStatus(401);
    const result = await auth_1.authService.refreshToken(refreshToken, getDeviceInfo(req));
    if (!result.success) {
        res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
        return res.status(403).json({ error: 'Session expired' });
    }
    res.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/auth/refresh',
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
    return res.json({ accessToken: result.accessToken });
});
router.post('/logout', (req, res) => {
    res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
    res.json({ message: 'Logged out' });
});
router.get('/me', auth_2.requireAuth, (req, res) => res.json({ user: req.user }));
exports.default = router;
