// server/middleware/auth.ts

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

// ✅ FIX: Global Declaration to ensure req.user exists everywhere
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

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<any> {
  try {
    // Support both Bearer Token (Header) AND Cookie (Best Practice)
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.auth_token; 

    const token = cookieToken || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };

    // Fetch user to ensure they exist
    const user = await db.user.findUnique({ where: { id: decoded.id } });
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

  } catch (error: any) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<any> {
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.auth_token;
    
    const token = cookieToken || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
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
    next();
  }
}
