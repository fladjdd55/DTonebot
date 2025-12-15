// server/priceVerification.ts

import { db } from './db';
import { dtoneService } from './dtone';
import dotenv from 'dotenv';
dotenv.config();

// Tolerance for price comparison (handles floating point and minor variations)
const PRICE_TOLERANCE_PERCENT = 0.01; // 1% tolerance

// ✅ 1. Get Global Min from Env (Must match Frontend variable)
const GLOBAL_MIN_USD = Number(process.env.VITE_MIN_USD_ORDER || 0);

export interface PriceVerificationResult {
  valid: boolean;
  expectedPrice?: number;
  expectedCurrency?: string;
  error?: string;
  code?: string;
}

// ✅ 2. Helper to calculate the adjusted minimum based on USD cost
function getAdjustedMin(product: any): number {
  let min = product.minAmount || 0;
  
  if (!product.type || !product.type.includes('RANGED')) {
    return product.amount || 0;
  }

  // If currency is USD, enforce directly
  if (product.currency === 'USD') {
    return Math.max(min, GLOBAL_MIN_USD);
  }

  // If we have a Cost Price in USD, calculate the Local Currency equivalent
  if (product.costPrice && product.costPrice > 0 && product.minAmount > 0) {
    const isCostUsd = !product.costCurrency || product.costCurrency === 'USD';
    
    if (isCostUsd) {
       // Ratio: Cost (USD) / Local Currency Unit
       // Example: Cost $1 for 100 HTG -> Ratio = 0.01
       const impliedRate = product.minAmount / product.costPrice;
       
       // Target Min (Local) = $5 / Ratio
       // Example: 5 / 0.01 = 500 HTG
       const minRequiredLocal = GLOBAL_MIN_USD * impliedRate;
       
       return Math.max(min, minRequiredLocal);
    }
  }

  return min;
}

export const priceVerificationService = {
  getAdjustedMin,

  /**
   * Verify that the payment amount matches the product price
   */
  async verifyProductPrice(
    productId: number,
    paidAmount: number,
    paidCurrency: string
  ): Promise<PriceVerificationResult> {
    try {
      // 1. Try to get product from local cache (DB)
      let product = await db.product.findUnique({ where: { id: productId } });

      // 2. If not in cache, skip strict verification (or fetch from API)
      if (!product) {
        console.log(`[Price Check] Product ${productId} not in cache.`);
        return {
          valid: true, 
          error: 'Product not in cache - price verification skipped',
          code: 'CACHE_MISS'
        };
      }

      // 3. Handle RANGED products
      if (product.type.includes('RANGED')) {
        
        // ✅ ENFORCE DYNAMIC MINIMUM
        const adjustedMin = getAdjustedMin(product);
        const max = product.maxAmount || Infinity;

        if (paidAmount < adjustedMin) {
          console.warn(`[Price Check] ❌ Amount ${paidAmount} below adjusted min ${adjustedMin} (Global Min: $${GLOBAL_MIN_USD})`);
          return {
            valid: false,
            expectedPrice: adjustedMin,
            expectedCurrency: product.currency,
            error: `Amount must be at least ${adjustedMin.toFixed(2)} ${product.currency}`,
            code: 'AMOUNT_TOO_LOW'
          };
        }

        if (paidAmount > max) {
          return {
            valid: false,
            expectedPrice: max,
            expectedCurrency: product.currency,
            error: `Amount must be at most ${max} ${product.currency}`,
            code: 'AMOUNT_TOO_HIGH'
          };
        }

        if (paidCurrency.toUpperCase() !== product.currency.toUpperCase()) {
          return {
            valid: false,
            expectedCurrency: product.currency,
            error: `Currency mismatch: expected ${product.currency}`,
            code: 'CURRENCY_MISMATCH'
          };
        }

        return { valid: true, expectedPrice: paidAmount, expectedCurrency: product.currency };
      }

      // 4. Handle FIXED products
      const expectedPrice = product.amount || 0;

      if (expectedPrice === 0) {
        return { valid: true, error: 'Product price not set', code: 'NO_PRICE' };
      }

      if (paidCurrency.toUpperCase() !== product.currency.toUpperCase()) {
        return {
          valid: false,
          expectedPrice,
          expectedCurrency: product.currency,
          error: `Currency mismatch: expected ${product.currency}`,
          code: 'CURRENCY_MISMATCH'
        };
      }

      const tolerance = expectedPrice * PRICE_TOLERANCE_PERCENT;
      const priceDiff = Math.abs(paidAmount - expectedPrice);

      if (priceDiff > tolerance) {
        return {
          valid: false,
          expectedPrice,
          expectedCurrency: product.currency,
          error: `Price mismatch: expected ${expectedPrice} ${product.currency}`,
          code: 'PRICE_MISMATCH'
        };
      }

      console.log(`[Price Check] ✅ Price verified: ${paidAmount} ${paidCurrency}`);
      return { valid: true, expectedPrice, expectedCurrency: product.currency };

    } catch (error: any) {
      console.error('[Price Check] Error:', error);
      return { valid: false, error: 'Price verification failed', code: 'VERIFICATION_ERROR' };
    }
  },

  /**
   * Get product price for payment intent creation
   */
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

      // ✅ Send the adjusted min so the Stripe Intent respects the limit
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
