import { TransactionStatus } from '@prisma/client';
import { db } from '../db';
import { getRedis } from './redis';
import { dtoneService } from '../dtone';
import { paymentService } from '../payment';
import { pricingService } from './pricingService';
import { logger } from '../lib/logger';

export const transactionService = {
  // Helper: Calculate Safe Minimum Amount
  getSafeMinAmount(p: any): number {
    return pricingService.getSafeMinAmount(p);
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
    
    // ✅ 1. IDEMPOTENCY CHECK
    const processedKey = `processed:${paymentId}`;
    const alreadyProcessed = await redis.get(processedKey);
    
    if (alreadyProcessed) {
      logger.info({ paymentId }, `[Purchase] ⏭️ Skipping (Idempotency Key Found)`);
      const existing = await db.transaction.findUnique({ where: { paymentIntentId: paymentId } });

      return {
        success: existing?.status === TransactionStatus.COMPLETED,
        dbStatus: existing?.status || TransactionStatus.PENDING,
        alreadyProcessed: true
      };
    }
    
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

      // ✅ 2. HANDLE EXISTING TRANSACTIONS
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
          await redis.set(processedKey, '1', 'EX', 86400); 
          return { success: true, ...existing, dbStatus: TransactionStatus.COMPLETED, alreadyProcessed: true };
        }
        // ✅ FIX: Cast the array to TransactionStatus[] to satisfy TypeScript strictness
        else if (( [TransactionStatus.FAILED, TransactionStatus.REFUNDED, TransactionStatus.REFUND_FAILED] as TransactionStatus[] ).includes(existing.status)) {
          await redis.set(processedKey, '1', 'EX', 86400); // Mark failed as processed so we don't retry blindly
          return { success: false, ...existing, dbStatus: existing.status, alreadyProcessed: true };
        }
        else if (existing.status === TransactionStatus.PENDING) {
          return { success: true, dbStatus: TransactionStatus.PENDING, alreadyProcessed: true };
        }
      }
      
      if (!mobileToUse) {
        logger.error({ paymentId }, `[Purchase] ❌ FATAL: No mobile number`);
        return { success: false, error: "Mobile number missing" };
      }

      // ✅ 3. CREATE TRANSACTION RECORD
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

      // ✅ 4. FETCH COUNTRY ISO (NEW FIX)
      // We attempt to find the country ISO for strict phone validation.
      let countryIso: string | undefined;
      
      try {
        const productData = await db.product.findUnique({
          where: { id: productId },
          // @ts-ignore - Assuming you will add these relations later
          include: { operator: { include: { country: true } } }
        }) as any;
        
        if (productData?.operator?.country?.isoCode) {
          countryIso = productData.operator.country.isoCode;
        }
      } catch (e) {
        // Ignore DB lookup errors for strict validation
      }

      const callbackUrl = process.env.DTONE_CALLBACK_URL
        ? `${process.env.DTONE_CALLBACK_URL}/api/hooks/dtone`
        : undefined;

      // ✅ 5. CALL DTONE (PASSING COUNTRY ISO)
      const result = await dtoneService.purchaseProduct(
        productId, 
        mobileToUse, 
        amount, 
        currency, 
        type, 
        callbackUrl, 
        countryIso // 👈 Passes the country code for strict validation
      );

      // ✅ 6. HANDLE RESULTS
      if (!result.success || !result.data) {
        logger.error({ paymentId, error: result.error }, `[Purchase] ❌ DTOne Error`);
        
        const refund = await paymentService.refundPayment(paymentId);
        
        const failStatus = refund ? TransactionStatus.REFUNDED : TransactionStatus.REFUND_FAILED;
        if (!refund) logger.error({ paymentId }, `[CRITICAL] 🚨 Refund failed after API error`);

        await db.transaction.update({
          where: { paymentIntentId: paymentId },
          data: { status: failStatus, externalId: `failed_${paymentId}` }
        });
        
        await redis.set(processedKey, '1', 'EX', 86400);

        return { success: false, error: result.error, code: result.code, refunded: !!refund };
      }

      const statusId = result.data.statusId;
      let dbStatus: TransactionStatus = TransactionStatus.PENDING;

      if (statusId === 7) {
        dbStatus = TransactionStatus.COMPLETED;
      } else if ([3, 9].includes(statusId || 0)) {
        logger.warn({ paymentId }, `[Purchase] ⚠️ Declined. Refunding...`);
        const refund = await paymentService.refundPayment(paymentId);
        dbStatus = TransactionStatus.FAILED;
        if (!refund) logger.error({ paymentId }, `[CRITICAL] 🚨 Refund failed for declined payment`);
      }

      await db.transaction.update({
        where: { paymentIntentId: paymentId },
        data: { status: dbStatus, externalId: result.data.externalId }
      });

      await redis.set(processedKey, '1', 'EX', 86400);

      logger.info({ 
        paymentId, 
        status: dbStatus, 
        externalId: result.data.externalId 
      }, '[Purchase] Completed successfully');

      if (userId) {
        await db.auditLog.create({
          data: {
            action: 'PURCHASE',
            userId: userId,
            metadata: { paymentId, productId, amount, status: dbStatus }
          }
        }).catch((e) => logger.error({ err: e }, 'Audit Log Failed'));
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
