"use strict";
// server/middleware/ipWhitelist.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.dtoneIpWhitelist = dtoneIpWhitelist;
const DTONE_ALLOWED_IPS = (process.env.DTONE_WHITELIST_IPS || '')
    .split(',')
    .map(ip => ip.trim())
    .filter(Boolean);
function dtoneIpWhitelist(req, res, next) {
    // Get real IP (handles proxies like Cloudflare, Railway, etc.)
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '')
        || req.socket?.remoteAddress
        || '';
    if (DTONE_ALLOWED_IPS.length === 0 || !DTONE_ALLOWED_IPS.includes(clientIp)) {
        console.error(`[Security] Blocked webhook from ${clientIp}`);
        return res.status(403).send('Forbidden'); // Don't reveal why
    }
    next();
}
