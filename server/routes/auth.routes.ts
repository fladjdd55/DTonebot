import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authService } from '../auth';
import { emailService } from '../services/emailService';
import { requireAuth } from '../middleware/auth';
import { db } from '../db';
import bcrypt from 'bcryptjs';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts" }
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const getDeviceInfo = (req: Request) => ({
  ip: req.ip || req.socket.remoteAddress || 'unknown',
  userAgent: req.headers['user-agent'] || 'unknown'
});

// ✅ NEW: Verify Email Endpoint
router.post('/verify-email', async (req: Request, res: Response): Promise<any> => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  const result = await emailService.verifyEmail(token);
  if (!result.success) return res.status(400).json({ error: result.error });

  return res.json({ message: 'Email verified successfully' });
});

// ✅ NEW: Forgot Password Request
router.post('/forgot-password', async (req: Request, res: Response): Promise<any> => {
  const { email } = req.body;
  // Always return success to prevent email enumeration
  if (email) await emailService.initiatePasswordReset(email);
  return res.json({ message: 'If that email exists, a reset link has been sent.' });
});

// ✅ NEW: Complete Password Reset
router.post('/reset-password', async (req: Request, res: Response): Promise<any> => {
  const { token, password } = req.body;

  const user = await db.user.findUnique({ where: { resetToken: token } });
  if (!user || !user.resetExpires || user.resetExpires < new Date()) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }

  const hash = await bcrypt.hash(password, 12);
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: hash, resetToken: null, resetExpires: null }
  });

  // Revoke all sessions
  await db.refreshToken.updateMany({
    where: { userId: user.id },
    data: { revoked: true }
  });

  return res.json({ message: 'Password reset successful' });
});

router.post('/register', authLimiter, async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);
    const result = await authService.register(email, password, name, getDeviceInfo(req));
    
    if (!result.success) return res.status(400).json({ error: result.error });

    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    
    return res.status(201).json({ user: result.user, accessToken: result.accessToken });
  } catch {
    return res.status(400).json({ error: 'Registration failed' });
  }
});

router.post('/login', authLimiter, async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await authService.login(email, password, getDeviceInfo(req));
    
    if (!result.success) return res.status(401).json({ error: result.error });
    
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    
    return res.json({ user: result.user, accessToken: result.accessToken });
  } catch {
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/refresh', async (req: Request, res: Response): Promise<any> => {
  const refreshToken = req.cookies.refresh_token;
  if (!refreshToken) return res.sendStatus(401);

  const result = await authService.refreshToken(refreshToken, getDeviceInfo(req));
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

// GET /auth/sessions - List active sessions
router.get('/sessions', requireAuth, async (req: any, res) => {
  const sessions = await db.refreshToken.findMany({
    where: { userId: req.user.id, revoked: false },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ sessions });
});

// DELETE /auth/sessions/:id - Revoke specific session
router.delete('/sessions/:id', requireAuth, async (req: any, res) => {
  const { id } = req.params;
  const session = await db.refreshToken.findFirst({
    where: { id, userId: req.user.id }
  });

  if (!session) return res.status(404).json({ error: 'Session not found' });

  await db.refreshToken.update({ where: { id }, data: { revoked: true } });
  res.json({ message: 'Session revoked' });
});

// POST /auth/sessions/revoke-all - Revoke all other sessions
router.post('/sessions/revoke-all', requireAuth, async (req: any, res) => {
  const currentToken = req.cookies.refresh_token;

  await db.refreshToken.updateMany({
    where: {
      userId: req.user.id,
      revoked: false,
      token: { not: currentToken } // Keep current session
    },
    data: { revoked: true }
  });

  res.json({ message: 'All other sessions revoked' });
});

router.get('/me', requireAuth, (req: any, res) => res.json({ user: req.user }));

export default router;
