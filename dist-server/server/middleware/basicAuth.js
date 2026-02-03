"use strict";
// server/middleware/basicAuth.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dtoneBasicAuth = dtoneBasicAuth;
var crypto_1 = __importDefault(require("crypto"));
function dtoneBasicAuth(req, res, next) {
    var authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        console.warn('[Security] 🚫 Missing Basic Auth on DTOne callback');
        return res.status(401).send('Unauthorized');
    }
    var base64Credentials = authHeader.split(' ')[1];
    var credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    var _a = credentials.split(':'), username = _a[0], password = _a[1];
    var expectedUser = process.env.DTONE_WEBHOOK_USER;
    var expectedPass = process.env.DTONE_WEBHOOK_PASS;
    // Fail fast if credentials are not configured
    if (!expectedUser || !expectedPass) {
        console.error('[Security] 🚫 DTONE_WEBHOOK_USER or DTONE_WEBHOOK_PASS not configured');
        return res.status(500).send('Server Configuration Error');
    }
    // Use timing-safe comparison to prevent timing attacks
    var expectedUserBuffer = Buffer.from(expectedUser);
    var expectedPassBuffer = Buffer.from(expectedPass);
    var usernameBuffer = Buffer.from(username || '');
    var passwordBuffer = Buffer.from(password || '');
    // Ensure buffers are same length for timingSafeEqual
    var usernameMatch = usernameBuffer.length === expectedUserBuffer.length &&
        crypto_1.default.timingSafeEqual(usernameBuffer, expectedUserBuffer);
    var passwordMatch = passwordBuffer.length === expectedPassBuffer.length &&
        crypto_1.default.timingSafeEqual(passwordBuffer, expectedPassBuffer);
    if (!usernameMatch || !passwordMatch) {
        console.warn('[Security] 🚫 Invalid credentials on DTOne callback');
        return res.status(401).send('Unauthorized');
    }
    next();
}
