"use strict";
// server/middleware/basicAuth.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.dtoneBasicAuth = dtoneBasicAuth;
function dtoneBasicAuth(req, res, next) {
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
