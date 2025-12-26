import dotenv from 'dotenv';
dotenv.config();

export const GLOBAL_MIN_USD = Number(
  process.env.MIN_USD_ORDER ||
  process.env.VITE_MIN_USD_ORDER ||
  process.env.MIN_ORDER ||
  5
);

// New global maximum to prevent overflows and abuse
export const GLOBAL_MAX_USD = Number(process.env.MAX_USD_ORDER) || 1000;

export const FALLBACK_MARGIN = Number(process.env.DTONE_FALLBACK_MARGIN) || 1.25;
export const DTONE_TIMEOUT_MS = Number(process.env.DTONE_TIMEOUT_MS) || 25000;
