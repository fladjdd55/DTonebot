import dotenv from 'dotenv';
dotenv.config();

export const GLOBAL_MIN_USD = Number(
  process.env.MIN_USD_ORDER ||
  process.env.VITE_MIN_USD_ORDER ||
  process.env.MIN_ORDER ||
  5
);

export const FALLBACK_MARGIN = Number(process.env.DTONE_FALLBACK_MARGIN) || 1.25;
