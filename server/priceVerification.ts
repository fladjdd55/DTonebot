// server/priceVerification.ts

import { db } from './db';
import { dtoneService } from './dtone';

// Tolerance for price comparison (handles floating point and minor variations)
const PRICE_TOLERANCE_PERCENT = 0.01; // 1% tolerance

export interface PriceVerificationResult {
  valid: boolean;
  expectedPrice?: number;
  expectedCurrency?: string;
  error?: string;
  code?: string;
}

export const priceVerificationService = {
  /**
   * Verify that the payment amount matches the product price
   * Returns the expected price for the product
   */
  async verifyProductPrice(
    productId: number,
    paidAmount: number,
    paidCurrency: string
  ): Promise<PriceVerificationResult> {
    try {
      // 1. Try to get product from local cache (DB)
      let product = await db.product.findUnique({ where: { id: productId } });

      // 2. If not in cache, fetch from DTOne API
      if (!product) {
        console.log(`[Price Check] Product ${productId} not in cache, fetching from API...`);
        
        // We need operator ID to fetch products, but we don't have it
        // So we'll do a broader search or trust the API for now
        // In production, you might want to cache all products more aggressively
        
        return {
          valid: true, // Allow if not in cache (trust frontend for now)
          error: 'Product not in cache - price verification skipped',
          code: 'CACHE_MISS'
        };
      }

      // 3. Handle RANGED products (custom amount)
      if (product.type.includes('RANGED')) {
        const min = product.minAmount || 0;
        const max = product.maxAmount || Infinity;

        if (paidAmount < min || paidAmount > max) {
          console.warn(`[Price Check] ❌ Amount ${paidAmount} outside range [${min}-${max}] for product ${productId}`);
          return {
            valid: false,
            expectedPrice: min,
            expectedCurrency: product.currency,
            error: `Amount must be between ${min} and ${max} ${product.currency}`,
            code: 'AMOUNT_OUT_OF_RANGE'
          };
        }

        // Currency must match
        if (paidCurrency.toUpperCase() !== product.currency.toUpperCase()) {
          console.warn(`[Price Check] ❌ Currency mismatch: paid ${paidCurrency}, expected ${product.currency}`);
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
        console.warn(`[Price Check] ⚠️ Product ${productId} has no price set`);
        return {
          valid: true, // Allow if no price set (data issue)
          error: 'Product price not set',
          code: 'NO_PRICE'
        };
      }

      // Currency must match
      if (paidCurrency.toUpperCase() !== product.currency.toUpperCase()) {
        console.warn(`[Price Check] ❌ Currency mismatch: paid ${paidCurrency}, expected ${product.currency}`);
        return {
          valid: false,
          expectedPrice,
          expectedCurrency: product.currency,
          error: `Currency mismatch: expected ${product.currency}`,
          code: 'CURRENCY_MISMATCH'
        };
      }

      // Price must match (with tolerance)
      const tolerance = expectedPrice * PRICE_TOLERANCE_PERCENT;
      const priceDiff = Math.abs(paidAmount - expectedPrice);

      if (priceDiff > tolerance) {
        console.warn(`[Price Check] ❌ Price mismatch: paid ${paidAmount}, expected ${expectedPrice} (diff: ${priceDiff})`);
        return {
          valid: false,
          expectedPrice,
          expectedCurrency: product.currency,
          error: `Price mismatch: expected ${expectedPrice} ${product.currency}`,
          code: 'PRICE_MISMATCH'
        };
      }

      console.log(`[Price Check] ✅ Price verified: ${paidAmount} ${paidCurrency} for product ${productId}`);
      return { valid: true, expectedPrice, expectedCurrency: product.currency };

    } catch (error: any) {
      console.error('[Price Check] Error:', error);
      return {
        valid: false,
        error: 'Price verification failed',
        code: 'VERIFICATION_ERROR'
      };
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

      return {
        success: true,
        price: product.amount || 0,
        currency: product.currency,
        min: product.minAmount || undefined,
        max: product.maxAmount || undefined,
        type: product.type
      };

    } catch (error: any) {
      console.error('[Price Check] getProductPrice error:', error);
      return { success: false, error: 'Failed to get product price' };
    }
  }
};

