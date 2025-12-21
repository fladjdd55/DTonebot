// server/lib/logger.ts
import pino from 'pino';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const isDev = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    env: process.env.NODE_ENV,
    service: 'rechargebot-api',
  },
  redact: {
    paths: ['password', 'token', 'authorization', '*.password', '*.token', 'req.headers.authorization'],
    censor: '[REDACTED]',
  },
});

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

// Request logger middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  // Attach to request for use in other handlers
  req.requestId = requestId;

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[logLevel]({
      type: 'request',
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });

  next();
};
