import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  // ==============================================
  // 🌍 SERVER CONFIGURATION
  // ==============================================
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000'),
  
  // Validate that this is a list of URLs (comma separated)
  ALLOWED_ORIGINS: z.string()
    .transform((val) => val.split(',').map((v) => v.trim()).filter(Boolean))
    .pipe(
      z.array(
        z.string().url({ message: "ALLOWED_ORIGINS must contain valid URLs (e.g. https://example.com)" })
      ).min(1, { message: "Production requires at least one ALLOWED_ORIGIN" })
    ),
  
  // Frontend API URL (Useful for emails or callbacks)
  VITE_API_URL: z.string().url().optional(),

  // ==============================================
  // 🔐 DATABASE & REDIS
  // ==============================================
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  
  // Redis is optional in dev, but highly recommended for production
  REDIS_URL: z.string().optional(),

  // ==============================================
  // 🔑 AUTHENTICATION
  // ==============================================
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters long"),
  JWT_EXPIRES_IN: z.string().default('7d'),
  
  // Optional encryption key for refresh tokens
  REFRESH_TOKEN_ENCRYPTION_KEY: z.string().optional(),

  // ==============================================
  // 📱 DTONE CONFIGURATION
  // ==============================================
  DTONE_API_KEY: z.string().min(1, "DTONE_API_KEY is required"),
  DTONE_API_SECRET: z.string().min(1, "DTONE_API_SECRET is required"),
  DTONE_MODE: z.enum(['sandbox', 'production']).default('sandbox'),
  
  // Business Logic
  VITE_MIN_USD_ORDER: z.coerce.number().default(5),
  DTONE_FALLBACK_MARGIN: z.coerce.number().default(1.15),
  
  // DTOne Security & Webhooks
  DTONE_WEBHOOK_USER: z.string().min(1, "DTONE_WEBHOOK_USER required for security"),
  DTONE_WEBHOOK_PASS: z.string().min(1, "DTONE_WEBHOOK_PASS required for security"),
  
  // Optional: Clean list of IPs for whitelist (comma separated)
  DTONE_WHITELIST_IPS: z.string().default('').transform((val) => 
    val.split(',').map(ip => ip.trim()).filter(Boolean)
  ),
  
  // Optional: Callback URL base
  DTONE_CALLBACK_URL: z.string().url().optional(),

  // ==============================================
  // 💳 STRIPE PAYMENTS
  // ==============================================
  STRIPE_SECRET_KEY: z.string().startsWith('sk_', "Stripe Secret Key must start with sk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_', "Stripe Webhook Secret must start with whsec_"),
  
  // Client key (Validated here just for completeness)
  VITE_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_', "Public Key must start with pk_"),

  // ==============================================
  // 🤖 EXTRAS (OPTIONAL)
  // ==============================================
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_APP_URL: z.string().url().optional(),
  ADMIN_WEBHOOK_URL: z.string().url().optional(),
  
  // Sync Flag (Boolean coercion)
  SYNC_ON_STARTUP: z.string().default('false').transform((val) => val === 'true'),
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

export const env = _env.data;
