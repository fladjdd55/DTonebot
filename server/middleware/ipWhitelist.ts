// server/middleware/ipWhitelist.ts

import { Request, Response, NextFunction } from 'express';

const DTONE_ALLOWED_IPS = (process.env.DTONE_WHITELIST_IPS || '')
  .split(',')
  .map(ip => ip.trim())
  .filter(Boolean);

export function dtoneIpWhitelist(req: Request, res: Response, next: NextFunction) {
  // Get real IP (handles proxies like Cloudflare, Railway, etc.)
  const forwarded = req.headers['x-forwarded-for'];
  const clientIp = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '')
                || req.socket?.remoteAddress 
                || '';

  if (DTONE_ALLOWED_IPS.length === 0) {
    console.warn('[Security] ⚠️ DTONE_WHITELIST_IPS not configured!');
    return res.status(500).send('Server misconfigured');
  }

  if (!DTONE_ALLOWED_IPS.includes(clientIp)) {
    console.warn(`[Security] 🚫 Blocked DTOne callback from unauthorized IP: ${clientIp}`);
    return res.status(403).send('Forbidden');
  }

  next();
}
