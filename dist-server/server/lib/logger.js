"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = exports.logger = void 0;
// server/lib/logger.ts
const pino_1 = __importDefault(require("pino"));
const crypto_1 = __importDefault(require("crypto"));
const isDev = process.env.NODE_ENV === 'development';
exports.logger = (0, pino_1.default)({
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
// Request logger middleware
const requestLogger = (req, res, next) => {
    const startTime = Date.now();
    const requestId = crypto_1.default.randomUUID();
    // Attach to request for use in other handlers
    req.requestId = requestId;
    // Log response when finished
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
        exports.logger[logLevel]({
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
exports.requestLogger = requestLogger;
