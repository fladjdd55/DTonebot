"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
// Load environment variables from .env file
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    // ==============================================
    // 🌍 SERVER CONFIGURATION
    // ==============================================
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    PORT: zod_1.z.string().default('5000'),
    // Validate that this is a list of URLs (comma separated)
    ALLOWED_ORIGINS: zod_1.z.string()
        .transform((val) => val.split(',').map((v) => v.trim()).filter(Boolean))
        .pipe(zod_1.z.array(zod_1.z.string().url({ message: "ALLOWED_ORIGINS must contain valid URLs (e.g. https://example.com)" })).min(1, { message: "Production requires at least one ALLOWED_ORIGIN" })),
    // Frontend API URL (Useful for emails or callbacks)
    VITE_API_URL: zod_1.z.string().url().optional(),
    // ==============================================
    // 🔐 DATABASE & REDIS
    // ==============================================
    DATABASE_URL: zod_1.z.string().min(1, "DATABASE_URL is required"),
    // Redis is optional in dev, but highly recommended for production
    REDIS_URL: zod_1.z.string().optional(),
    // ==============================================
    // 🔑 AUTHENTICATION
    // ==============================================
    JWT_SECRET: zod_1.z.string().min(32, "JWT_SECRET must be at least 32 characters long"),
    JWT_EXPIRES_IN: zod_1.z.string().default('7d'),
    // Optional encryption key for refresh tokens
    REFRESH_TOKEN_ENCRYPTION_KEY: zod_1.z.string().optional(),
    // ==============================================
    // 📱 DTONE CONFIGURATION
    // ==============================================
    DTONE_API_KEY: zod_1.z.string().min(1, "DTONE_API_KEY is required"),
    DTONE_API_SECRET: zod_1.z.string().min(1, "DTONE_API_SECRET is required"),
    DTONE_MODE: zod_1.z.enum(['sandbox', 'production']).default('sandbox'),
    // Business Logic
    VITE_MIN_USD_ORDER: zod_1.z.coerce.number().default(5),
    DTONE_FALLBACK_MARGIN: zod_1.z.coerce.number().default(1.15),
    // DTOne Security & Webhooks
    DTONE_WEBHOOK_USER: zod_1.z.string().min(1, "DTONE_WEBHOOK_USER required for security"),
    DTONE_WEBHOOK_PASS: zod_1.z.string().min(1, "DTONE_WEBHOOK_PASS required for security"),
    // Optional: Clean list of IPs for whitelist (comma separated)
    DTONE_WHITELIST_IPS: zod_1.z.string().default('').transform((val) => val.split(',').map(ip => ip.trim()).filter(Boolean)),
    // Optional: Callback URL base
    DTONE_CALLBACK_URL: zod_1.z.string().url().optional(),
    // ==============================================
    // 💳 STRIPE PAYMENTS
    // ==============================================
    STRIPE_SECRET_KEY: zod_1.z.string().startsWith('sk_', "Stripe Secret Key must start with sk_"),
    STRIPE_WEBHOOK_SECRET: zod_1.z.string().startsWith('whsec_', "Stripe Webhook Secret must start with whsec_"),
    // Client key (Validated here just for completeness)
    VITE_STRIPE_PUBLISHABLE_KEY: zod_1.z.string().startsWith('pk_', "Public Key must start with pk_"),
    // ==============================================
    // 🤖 EXTRAS (OPTIONAL)
    // ==============================================
    TELEGRAM_BOT_TOKEN: zod_1.z.string().optional(),
    TELEGRAM_APP_URL: zod_1.z.string().url().optional(),
    ADMIN_WEBHOOK_URL: zod_1.z.string().url().optional(),
    // Sync Flag (Boolean coercion)
    SYNC_ON_STARTUP: zod_1.z.string().default('false').transform((val) => val === 'true'),
});
// Parse and Validate
const _env = envSchema.safeParse(process.env);
if (!_env.success) {
    console.error('❌ FATAL: Invalid environment variables:');
    // Pretty print the errors
    const formattedErrors = _env.error.format();
    Object.entries(formattedErrors).forEach(([key, value]) => {
        if (value && '_errors' in value && value._errors.length > 0) {
            console.error(`   👉 ${key}: ${value._errors.join(', ')}`);
        }
    });
    throw new Error('Invalid environment variables');
}
exports.env = _env.data;
