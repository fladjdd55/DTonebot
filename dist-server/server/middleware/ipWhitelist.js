"use strict";
// server/middleware/ipWhitelist.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.dtoneIpWhitelist = dtoneIpWhitelist;
var DTONE_ALLOWED_IPS = (process.env.DTONE_WHITELIST_IPS || '')
    .split(',')
    .map(function (ip) { return ip.trim(); })
    .filter(Boolean);
function dtoneIpWhitelist(req, res, next) {
    var _a;
    // Get real IP (handles proxies like Cloudflare, Railway, etc.)
    var forwarded = req.headers['x-forwarded-for'];
    var clientIp = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '')
        || ((_a = req.socket) === null || _a === void 0 ? void 0 : _a.remoteAddress)
        || '';
    if (DTONE_ALLOWED_IPS.length === 0 || !DTONE_ALLOWED_IPS.includes(clientIp)) {
        console.error("[Security] Blocked webhook from ".concat(clientIp));
        return res.status(403).send('Forbidden'); // Don't reveal why
    }
    next();
}
