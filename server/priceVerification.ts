// server/priceVerification.ts

import dotenv from 'dotenv';
dotenv.config();
import { db } from './db';
import { pricingService } from './services/pricingService';

export interface PriceVerificationResult {
  valid: boolean;
  expectedPrice?: number;
  expectedCurrency?: string;
  error?: string;
  code?: string;
}

export const priceVerificationService = {
  // Delegate helper to the centralized service
  getAdjustedMin(product: any): number {
    return pricingService.getSafeMinAmount(product);
  },

  async verifyProductPrice(
    productId: number,
    paidAmount: number, // The amount the user PAID (in USD)
    paidCurrency: string
  ): Promise<PriceVerificationResult> {
    try {
      const product = await db.product.findUnique({ where: { id: productId } });

      if (!product) {
        console.error(`[Price Check] 🚨 BLOCKED: Product ${productId} not found in DB.`);
        return {
          valid: false,
          error: 'Product not found. Transaction blocked for security.',
          code: 'PRODUCT_NOT_FOUND'
        };
      }

      // Enforce USD Payment Currency (since we charge in USD)
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
      // Using .includes('RANGE') to match 'RANGE', 'RANGED', etc.
      if (product.type && product.type.toUpperCase().includes('RANGE')) {
         // For Ranged products, we need to ensure the user paid at least the global minimum.
         const { minRequired } = pricingService.calculatePrice(product, product.minAmount || 0);
         
         if (paidAmount < minRequired) {
             return { 
               valid: false, 
               expectedPrice: minRequired,
               expectedCurrency: 'USD',
               error: `Amount too low. Min: $${minRequired}`, 
               code: 'AMOUNT_TOO_LOW' 
             };
         }
         // If they paid enough, we assume it's valid for ranged.
         return { valid: true, expectedPrice: paidAmount, expectedCurrency: 'USD' };
      }

      // ---------------------------------------------------------
      // CASE 2: FIXED PRODUCTS
      // ---------------------------------------------------------
      // Calculate what the price SHOULD be using the central service
      const { finalCharge } = pricingService.calculatePrice(product);
      
      // 5% Tolerance for floating point differences or slight rate drifts
      const tolerance = finalCharge * 0.05; 

      if (Math.abs(paidAmount - finalCharge) > tolerance) {
         // Check for Underpayment
         if (paidAmount < finalCharge - tolerance) {
           console.warn(`[Price Check] ❌ Underpaid: Paid $${paidAmount}, Expected ~$${finalCharge.toFixed(2)}`);
           return {
            valid: false,
            expectedPrice: finalCharge,
            expectedCurrency: 'USD',
            error: `Underpaid: Paid $${paidAmount}, Expected ~$${finalCharge.toFixed(2)}`,
            code: 'PRICE_MISMATCH_LOW'
          };
        }
        // Overpayment is allowed (we keep the extra profit), but we log it
        console.warn(`[Price Check] ⚠️ Overpaid: Paid $${paidAmount}, Expected ~$${finalCharge.toFixed(2)}`);
      }

      console.log(`[Price Check] ✅ Verified: Paid $${paidAmount} (Expected: ~$${finalCharge.toFixed(2)})`);
      return { valid: true, expectedPrice: finalCharge, expectedCurrency: 'USD' };

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

      const adjustedMin = pricingService.getSafeMinAmount(product);

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
