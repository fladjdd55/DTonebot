// server/priceVerification.ts

import { db } from './db';
import dotenv from 'dotenv';
dotenv.config();

// ✅ FIX: Define the same margin used in Routes.ts
const FALLBACK_MARGIN = Number(process.env.DTONE_FALLBACK_MARGIN) || 1.15;

// ✅ FIX: Increased tolerance to 5% to handle rounding differences
const PRICE_TOLERANCE_PERCENT = 0.05; 

// Global Min from Env
const GLOBAL_MIN_USD = Number(process.env.VITE_MIN_USD_ORDER || 0);

export interface PriceVerificationResult {
  valid: boolean;
  expectedPrice?: number;
  expectedCurrency?: string;
  error?: string;
  code?: string;
}

function getAdjustedMin(product: any): number {
  let min = product.minAmount || 0;
  
  if (!product.type || !product.type.includes('RANGED')) {
    return product.amount || 0;
  }

  // If product currency is USD, ensure it meets global min
  if (product.currency === 'USD') {
    return Math.max(min, GLOBAL_MIN_USD);
  }

  // Calculate equivalent local currency min based on USD cost
  if (product.costPrice && product.costPrice > 0 && product.minAmount > 0) {
    const isCostUsd = !product.costCurrency || product.costCurrency === 'USD';
    if (isCostUsd) {
       const impliedRate = product.minAmount / product.costPrice;
       const minRequiredLocal = GLOBAL_MIN_USD * impliedRate;
       return Math.max(min, minRequiredLocal);
    }
  }

  return min;
}

export const priceVerificationService = {
  getAdjustedMin,

  async verifyProductPrice(
    productId: number,
    paidAmount: number,
    paidCurrency: string
  ): Promise<PriceVerificationResult> {
    try {
      let product = await db.product.findUnique({ where: { id: productId } });

      if (!product) {
        console.log(`[Price Check] Product ${productId} not in cache.`);
        return {
          valid: true, 
          error: 'Product not in cache - price verification skipped',
          code: 'CACHE_MISS'
        };
      }

      // ✅ FIX: Enforce USD Payment Currency (since we charge in USD)
      if (paidCurrency.toUpperCase() !== 'USD') {
        return {
          valid: false,
          expectedCurrency: 'USD',
          error: `Currency mismatch: Paid ${paidCurrency}, expected USD`,
          code: 'CURRENCY_MISMATCH'
        };
      }

      // ---------------------------------------------------------
      // CASE 1: RANGED PRODUCTS
      // ---------------------------------------------------------
      if (product.type.includes('RANGED')) {
        // For ranged products, the 'paidAmount' is the user's custom amount (in USD).
        // Since ranged calculations are complex, we primarily check if it covers the base cost.
        // (Simplified check: Ensure it's not suspiciously low)
        
        const absoluteMinUsd = GLOBAL_MIN_USD;
        
        if (paidAmount < absoluteMinUsd) {
           return {
            valid: false,
            expectedPrice: absoluteMinUsd,
            expectedCurrency: 'USD',
            error: `Amount too low. Min: $${absoluteMinUsd} USD`,
            code: 'AMOUNT_TOO_LOW'
          };
        }
        
        return { valid: true, expectedPrice: paidAmount, expectedCurrency: 'USD' };
      }

      // ---------------------------------------------------------
      // CASE 2: FIXED PRODUCTS (Your Fix Applied Here)
      // ---------------------------------------------------------
      
      // 1. Determine Base Cost (Preference: Cost Price -> Face Value)
      const baseCost = product.costPrice || product.amount || 0;

      if (baseCost === 0) {
        return { valid: true, error: 'Product price not set', code: 'NO_PRICE' };
      }

      // 2. Calculate Expected Price (Base Cost * Margin)
      const expectedPrice = baseCost * FALLBACK_MARGIN;

      // 3. Compare with Tolerance
      const tolerance = expectedPrice * PRICE_TOLERANCE_PERCENT;
      const priceDiff = Math.abs(paidAmount - expectedPrice);

      if (priceDiff > tolerance) {
        console.warn(`[Price Check] ❌ Mismatch: Paid $${paidAmount}, Expected ~$${expectedPrice.toFixed(2)} (Base: $${baseCost} * Margin: ${FALLBACK_MARGIN})`);
        
        // Allow overpayment (if profit is higher than expected), block underpayment
        if (paidAmount < expectedPrice - tolerance) {
           return {
            valid: false,
            expectedPrice,
            expectedCurrency: 'USD',
            error: `Underpaid: Paid $${paidAmount}, Expected ~$${expectedPrice.toFixed(2)}`,
            code: 'PRICE_MISMATCH_LOW'
          };
        }
      }

      console.log(`[Price Check] ✅ Verified: Paid $${paidAmount} (Expected: ~$${expectedPrice.toFixed(2)})`);
      return { valid: true, expectedPrice, expectedCurrency: 'USD' };

    } catch (error: any) {
      console.error('[Price Check] Error:', error);
      return { valid: false, error: 'Price verification failed', code: 'VERIFICATION_ERROR' };
    }
  },

  async getProductPrice(productId: number): Promise<{
    success: boolean;
    price?: number;
    currency?: string;
    min?: number;
    max?: number;
    type?: string;
    error?: string;
  }> {
    try {
      const product = await db.product.findUnique({ where: { id: productId } });

      if (!product) {
        return { success: false, error: 'Product not found' };
      }

      const adjustedMin = getAdjustedMin(product);

      return {
        success: true,
        price: product.amount || 0,
        currency: product.currency,
        min: adjustedMin, 
        max: product.maxAmount || undefined,
        type: product.type
      };

    } catch (error: any) {
      console.error('[Price Check] getProductPrice error:', error);
      return { success: false, error: 'Failed to get product price' };
    }
  }
};
