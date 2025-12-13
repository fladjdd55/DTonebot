// server/middleware/basicAuth.ts

import { Request, Response, NextFunction } from 'express';

export function dtoneBasicAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    console.warn('[Security] 🚫 Missing Basic Auth on DTOne callback');
    return res.status(401).send('Unauthorized');
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
  const [username, password] = credentials.split(':');

  const expectedUser = process.env.DTONE_WEBHOOK_USER;
  const expectedPass = process.env.DTONE_WEBHOOK_PASS;

  if (username !== expectedUser || password !== expectedPass) {
    console.warn('[Security] 🚫 Invalid credentials on DTOne callback');
    return res.status(401).send('Unauthorized');
  }

  next();
}
