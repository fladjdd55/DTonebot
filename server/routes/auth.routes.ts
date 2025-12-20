import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authService } from '../auth';
import { requireAuth } from '../middleware/auth';

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

router.get('/me', requireAuth, (req: any, res) => res.json({ user: req.user }));

export default router;
