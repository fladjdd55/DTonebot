"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionService = void 0;
const client_1 = require("@prisma/client");
const db_1 = require("../db");
const redis_1 = require("./redis");
const dtone_1 = require("../dtone");
const payment_1 = require("../payment");
const pricingService_1 = require("./pricingService");
const logger_1 = require("../lib/logger"); // ✅ Import Logger
exports.transactionService = {
    // Helper: Calculate Safe Minimum Amount
    getSafeMinAmount(p) {
        return pricingService_1.pricingService.getSafeMinAmount(p);
    },
    async processPurchase(data, source = 'API') {
        const { paymentId, mobile, email, productId, amount, currency, type, userId } = data;
        const redis = (0, redis_1.getRedis)();
        // ✅ IDEMPOTENCY CHECK (Optimization)
        // Check if this payment ID was already processed successfully in the last 24h.
        // This prevents the "Lock Release Race" where Webhook grabs lock 1ms after API releases it.
        const processedKey = `processed:${paymentId}`;
        const alreadyProcessed = await redis.get(processedKey);
        if (alreadyProcessed) {
            logger_1.logger.info({ paymentId }, `[Purchase] ⏭️ Skipping (Idempotency Key Found)`);
            const existing = await db_1.db.transaction.findUnique({
                where: { paymentIntentId: paymentId }
            });
            return {
                success: existing?.status === client_1.TransactionStatus.COMPLETED,
                dbStatus: existing?.status || client_1.TransactionStatus.PENDING,
                alreadyProcessed: true
            };
        }
        const lockKey = `lock:purchase:${paymentId}`;
        const isLocked = await redis.set(lockKey, '1', 'EX', 15, 'NX');
        if (!isLocked) {
            return { success: true, dbStatus: client_1.TransactionStatus.PENDING, alreadyProcessed: true };
        }
        try {
            const existing = await db_1.db.transaction.findUnique({
                where: { paymentIntentId: paymentId }
            });
            let mobileToUse = data.mobile;
            if (existing) {
                if (existing.status === client_1.TransactionStatus.INITIALIZED) {
                    mobileToUse = existing.mobile;
                    await db_1.db.transaction.update({
                        where: { paymentIntentId: paymentId },
                        data: {
                            status: client_1.TransactionStatus.PENDING,
                            externalId: `pending_${paymentId}`,
                            processedVia: source
                        }
                    });
                }
                else if (existing.status === client_1.TransactionStatus.COMPLETED) {
                    // ✅ Self-Healing: If DB is complete but Redis key expired/missing, restore it.
                    await redis.set(processedKey, '1', 'EX', 86400);
                    return { success: true, ...existing, dbStatus: client_1.TransactionStatus.COMPLETED, alreadyProcessed: true };
                }
                else if (existing.status === client_1.TransactionStatus.FAILED ||
                    existing.status === client_1.TransactionStatus.REFUNDED ||
                    existing.status === client_1.TransactionStatus.REFUND_FAILED) {
                    await redis.set(processedKey, '1', 'EX', 86400); // Mark failed as processed so we don't retry blindly
                    return { success: false, ...existing, dbStatus: existing.status, alreadyProcessed: true };
                }
                else if (existing.status === client_1.TransactionStatus.PENDING) {
                    return { success: true, dbStatus: client_1.TransactionStatus.PENDING, alreadyProcessed: true };
                }
            }
            if (!mobileToUse) {
                logger_1.logger.error({ paymentId }, `[Purchase] ❌ FATAL: No mobile number`);
                return { success: false, error: "Mobile number missing" };
            }
            if (!existing) {
                try {
                    await db_1.db.transaction.create({
                        data: {
                            externalId: `pending_${paymentId}`,
                            paymentIntentId: paymentId,
                            mobile: mobileToUse,
                            email: email || null,
                            productId,
                            amount,
                            currency,
                            productType: type,
                            status: client_1.TransactionStatus.PENDING,
                            processedVia: source,
                            userId: userId || null
                        }
                    });
                }
                catch (err) {
                    if (err.code === 'P2002') {
                        const check = await db_1.db.transaction.findUnique({ where: { paymentIntentId: paymentId } });
                        return { success: check?.status === client_1.TransactionStatus.COMPLETED, dbStatus: check?.status, alreadyProcessed: true };
                    }
                    throw err;
                }
            }
            const callbackUrl = process.env.DTONE_CALLBACK_URL
                ? `${process.env.DTONE_CALLBACK_URL}/api/hooks/dtone`
                : undefined;
            const result = await dtone_1.dtoneService.purchaseProduct(productId, mobileToUse, amount, currency, type, callbackUrl);
            if (!result.success || !result.data) {
                logger_1.logger.error({ paymentId, error: result.error }, `[Purchase] ❌ DTOne Error`);
                const refund = await payment_1.paymentService.refundPayment(paymentId);
                const failStatus = refund ? client_1.TransactionStatus.REFUNDED : client_1.TransactionStatus.REFUND_FAILED;
                if (!refund)
                    logger_1.logger.error({ paymentId }, `[CRITICAL] 🚨 Refund failed after API error`);
                await db_1.db.transaction.update({
                    where: { paymentIntentId: paymentId },
                    data: { status: failStatus, externalId: `failed_${paymentId}` }
                });
                // ✅ Mark as processed (even if failed) so we don't retry automatically without intervention
                await redis.set(processedKey, '1', 'EX', 86400);
                return { success: false, error: result.error, code: result.code, refunded: !!refund };
            }
            const statusId = result.data.statusId;
            let dbStatus = client_1.TransactionStatus.PENDING;
            if (statusId === 7) {
                dbStatus = client_1.TransactionStatus.COMPLETED;
            }
            else if ([3, 9].includes(statusId || 0)) {
                logger_1.logger.warn({ paymentId }, `[Purchase] ⚠️ Declined. Refunding...`);
                const refund = await payment_1.paymentService.refundPayment(paymentId);
                dbStatus = client_1.TransactionStatus.FAILED;
                if (!refund)
                    logger_1.logger.error({ paymentId }, `[CRITICAL] 🚨 Refund failed for declined payment`);
            }
            await db_1.db.transaction.update({
                where: { paymentIntentId: paymentId },
                data: { status: dbStatus, externalId: result.data.externalId }
            });
            // ✅ SUCCESS: Mark this payment ID as processed for 24 hours
            await redis.set(processedKey, '1', 'EX', 86400);
            logger_1.logger.info({
                paymentId,
                status: dbStatus,
                externalId: result.data.externalId
            }, '[Purchase] Completed successfully');
            if (userId) {
                await db_1.db.auditLog.create({
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
                }).catch((e) => logger_1.logger.error({ err: e }, 'Audit Log Failed'));
            }
            return {
                success: dbStatus === client_1.TransactionStatus.COMPLETED || dbStatus === client_1.TransactionStatus.PENDING,
                ...result.data,
                dbStatus
            };
        }
        finally {
            await redis.del(lockKey);
        }
    }
};
