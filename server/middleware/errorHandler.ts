// server/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodIssue } from 'zod';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { logger } from '../lib/logger';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 400,
    public code: string = 'BAD_REQUEST'
  ) {
    super(message);
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const errorId = crypto.randomUUID().slice(0, 8);

  // Log full error internally
  logger.error({
    errorId,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: (req as any).user?.id
  });

  // Zod Validation Errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errorId,
      details: err.issues.map((e: ZodIssue) => ({ 
        field: e.path.join('.'), 
        message: e.message 
      }))
    });
  }

  // Custom App Errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      errorId
    });
  }

  // Prisma Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Resource already exists', code: 'DUPLICATE', errorId });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Resource not found', code: 'NOT_FOUND', errorId });
    }
  }

  // Generic fallback (hide internals)
  return res.status(500).json({
    error: 'An unexpected error occurred',
    code: 'INTERNAL_ERROR',
    errorId
  });
}
