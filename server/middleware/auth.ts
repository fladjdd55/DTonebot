// server/middleware/auth.ts

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { getRedis } from '../services/redis'; // ✅ Import Redis

const redis = getRedis();

// ✅ SECURITY: Fail fast if JWT_SECRET is missing
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET must be set in environment variables');
}

// ✅ TypeScript now knows JWT_SECRET is definitely a string
const SECRET: string = JWT_SECRET;

// Global Declaration to ensure req.user exists everywhere
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name?: string | null;
        phone?: string | null;
      };
    }
  }
}

interface JwtPayloadWithUser {
  id: string;
  email: string;
  iat?: number;
  exp?: number;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<any> {
  try {
    // Support both Bearer Token (Header) AND Cookie
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.auth_token;

    const token = cookieToken || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // ✅ FIX: Use SECRET (guaranteed string) and cast through unknown
    const decoded = jwt.verify(token, SECRET) as unknown as JwtPayloadWithUser;

    // Fetch user to ensure they exist
    const user = await db.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // ✅ NEW: User-Specific Rate Limiting (Redis)
    // Limit: 200 requests per hour per user
    const userKey = `ratelimit:user:${user.id}`;
    const count = await redis.incr(userKey, 3600); // 1 hour TTL (sliding window)

    if (count > 200) {
      console.warn(`[RateLimit] User ${user.id} exceeded limit (${count}/200)`);
      return res.status(429).json({ error: 'Too many requests. Please try again in an hour.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone
    };

    next();

  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<any> {
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.auth_token;

    const token = cookieToken || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);

    if (token) {
      // ✅ FIX: Use SECRET (guaranteed string) and cast through unknown
      const decoded = jwt.verify(token, SECRET) as unknown as JwtPayloadWithUser;
      const user = await db.user.findUnique({ where: { id: decoded.id } });
      
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
  } catch (error) {
    // Token invalid/expired - continue as guest
    next();
  }
}
