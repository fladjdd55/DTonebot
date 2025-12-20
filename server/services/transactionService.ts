import { TransactionStatus } from '@prisma/client';
import { db } from '../db'; // Adjust path if needed (e.g. ../../server/db) depending on tsconfig base
import { getRedis } from './redis'; // Adjust path
import { dtoneService } from '../dtone';
import { paymentService } from '../payment';
import { GLOBAL_MIN_USD, FALLBACK_MARGIN } from '../config';

export const transactionService = {
  // Helper: Calculate Safe Minimum Amount
  getSafeMinAmount(p: any): number {
    let safeMin = p.minAmount || 0;

    // Only check Ranged products
    if (p.type === 'RANGED_VALUE') {
      // 1. Try to use cached cost price from DB
      const baseMinCost = p.costPriceMin || p.costPrice;

      if (baseMinCost && baseMinCost > 0) {
        const costPerUnit = baseMinCost / (p.minAmount || 1);
        
        // Target: We need (Cost * Margin) >= GLOBAL_MIN_USD
        const targetCostUsd = GLOBAL_MIN_USD / FALLBACK_MARGIN;
        const requiredUnits = targetCostUsd / costPerUnit;

        if (requiredUnits > safeMin) {
          safeMin = Math.ceil(requiredUnits);
        }
      } 
      // 2. Fallback: If DB missing cost (Sync didn't run), assume 1-to-1 conversion roughly
      else if (p.currency === 'USD') {
         const targetUnits = GLOBAL_MIN_USD / FALLBACK_MARGIN;
         if (targetUnits > safeMin) safeMin = Math.ceil(targetUnits);
      }
    }
    return safeMin;
  },

  async processPurchase(
    data: {
      paymentId: string;
      mobile?: string;
      email?: string;
      productId: number;
      amount: number;
      currency: string;
      type: string;
      userId?: string;
    },
    source: 'API' | 'WEBHOOK' = 'API'
  ): Promise<any> {
    const { paymentId, mobile, email, productId, amount, currency, type, userId } = data;
    const redis = getRedis();
    const lockKey = `lock:purchase:${paymentId}`;

    const isLocked = await redis.set(lockKey, '1', 'EX', 15, 'NX');
    if (!isLocked) {
      return { success: true, dbStatus: TransactionStatus.PENDING, alreadyProcessed: true };
    }

    try {
      const existing = await db.transaction.findUnique({
        where: { paymentIntentId: paymentId }
      });

      let mobileToUse = data.mobile;

      if (existing) {
        if (existing.status === TransactionStatus.INITIALIZED) {
           mobileToUse = existing.mobile;
           await db.transaction.update({
              where: { paymentIntentId: paymentId },
              data: { 
                status: TransactionStatus.PENDING, 
                externalId: `pending_${paymentId}`,
                processedVia: source 
              }
           });
        }
        else if (existing.status === TransactionStatus.COMPLETED) {
          return { success: true, ...existing, dbStatus: TransactionStatus.COMPLETED, alreadyProcessed: true };
        }
        else if (
          existing.status === TransactionStatus.FAILED || 
          existing.status === TransactionStatus.REFUNDED || 
          existing.status === TransactionStatus.REFUND_FAILED
        ) {
          return { success: false, ...existing, dbStatus: existing.status, alreadyProcessed: true };
        }
        else if (existing.status === TransactionStatus.PENDING) {
          return { success: true, dbStatus: TransactionStatus.PENDING, alreadyProcessed: true };
        }
      }
      
      if (!mobileToUse) {
        console.error(`[Purchase] ❌ FATAL: No mobile number for ${paymentId}`);
        return { success: false, error: "Mobile number missing" };
      }

      if (!existing) {
        try {
          await db.transaction.create({
            data: {
              externalId: `pending_${paymentId}`,
              paymentIntentId: paymentId,
              mobile: mobileToUse,
              email: email || null,
              productId,
              amount,
              currency,
              productType: type,
              status: TransactionStatus.PENDING,
              processedVia: source, 
              userId: userId || null
            }
          });
        } catch (err: any) {
          if (err.code === 'P2002') {
             const check = await db.transaction.findUnique({ where: { paymentIntentId: paymentId } });
             return { success: check?.status === TransactionStatus.COMPLETED, dbStatus: check?.status, alreadyProcessed: true };
          }
          throw err;
        }
      }

      const callbackUrl = process.env.DTONE_CALLBACK_URL
        ? `${process.env.DTONE_CALLBACK_URL}/api/hooks/dtone`
        : undefined;

      const result = await dtoneService.purchaseProduct(
        productId, mobileToUse, amount, currency, type, callbackUrl
      );

      if (!result.success || !result.data) {
        console.error(`[Purchase] ❌ DTOne Error: ${result.error}`);
        const refund = await paymentService.refundPayment(paymentId);
        
        const failStatus = refund ? TransactionStatus.REFUNDED : TransactionStatus.REFUND_FAILED;
        if (!refund) console.error(`[CRITICAL] 🚨 Refund failed for payment ${paymentId}`);

        await db.transaction.update({
          where: { paymentIntentId: paymentId },
          data: { status: failStatus, externalId: `failed_${paymentId}` }
        });

        return { success: false, error: result.error, code: result.code, refunded: !!refund };
      }

      const statusId = result.data.statusId;
      let dbStatus: TransactionStatus = TransactionStatus.PENDING;

      if (statusId === 7) {
        dbStatus = TransactionStatus.COMPLETED;
      } else if ([3, 9].includes(statusId || 0)) {
        console.warn(`[Purchase] ⚠️ Declined. Refunding...`);
        const refund = await paymentService.refundPayment(paymentId);
        dbStatus = TransactionStatus.FAILED;
        if (!refund) console.error(`[CRITICAL] 🚨 Refund failed for declined payment ${paymentId}`);
      }

      await db.transaction.update({
        where: { paymentIntentId: paymentId },
        data: { status: dbStatus, externalId: result.data.externalId }
      });

      if (userId) {
        await db.auditLog.create({
          data: {
            action: 'PURCHASE',
            userId: userId,
            metadata: {
              paymentId,
              productId,
              amount,
              status: dbStatus
            }
          }
        }).catch(console.error);
      }

      return { 
        success: dbStatus === TransactionStatus.COMPLETED || dbStatus === TransactionStatus.PENDING, 
        ...result.data, 
        dbStatus 
      };

    } finally {
      await redis.del(lockKey);
    }
  }
};
