"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = require("../lib/logger");
class AppError extends Error {
    message;
    statusCode;
    code;
    constructor(message, statusCode = 400, code = 'BAD_REQUEST') {
        super(message);
        this.message = message;
        this.statusCode = statusCode;
        this.code = code;
    }
}
exports.AppError = AppError;
function errorHandler(err, req, res, _next) {
    const errorId = crypto_1.default.randomUUID().slice(0, 8);
    // Log full error internally
    logger_1.logger.error({
        errorId,
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        userId: req.user?.id
    });
    // Zod Validation Errors
    if (err instanceof zod_1.ZodError) {
        return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            errorId,
            details: err.issues.map((e) => ({
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
    if (err instanceof client_1.Prisma.PrismaClientKnownRequestError) {
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
