"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importStar(require("express"));
const stripe_1 = __importDefault(require("stripe"));
const db_1 = require("../db");
const transactionService_1 = require("../services/transactionService");
const payment_1 = require("../payment"); // ✅ Import Payment Service for refunds
const client_1 = require("@prisma/client");
const basicAuth_1 = require("../middleware/basicAuth");
const ipWhitelist_1 = require("../middleware/ipWhitelist");
const logger_1 = require("../lib/logger"); // ✅ Import Logger
const router = (0, express_1.Router)();
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' });
// ============================================================================
// 1. STRIPE WEBHOOK (Handles Incoming Money)
// ============================================================================
router.post('/stripe', express_1.default.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret || !sig)
        return res.status(400).send('Webhook Error');
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    }
    catch (err) {
        logger_1.logger.error({ err }, 'Stripe Webhook Signature Verification Failed');
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    // Idempotency: Only ignore events we have SUCCESSFULLY processed
    const existingEvent = await db_1.db.webhookEvent.findUnique({
        where: { eventId: event.id }
    });
    // FIX: Only return early if the event was actually fully processed.
    // If it exists but processed is false, it means a previous attempt failed, 
    // and we MUST allow this retry to proceed.
    if (existingEvent?.processed) {
        return res.json({ received: true });
    }
    // Log the event (Only create if it doesn't exist to prevent unique constraint errors on retry)
    if (!existingEvent) {
        await db_1.db.webhookEvent.create({
            data: {
                eventId: event.id,
                eventType: event.type,
                payload: event.data.object,
                processed: false
            }
        });
    }
    else {
        logger_1.logger.warn({ eventId: event.id }, 'Retrying previously failed webhook event');
    }
    try {
        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;
            logger_1.logger.info({ paymentId: paymentIntent.id }, 'Stripe Payment Succeeded');
            await transactionService_1.transactionService.processPurchase({
                paymentId: paymentIntent.id,
                mobile: paymentIntent.metadata.mobile,
                email: paymentIntent.receipt_email || undefined,
                productId: Number(paymentIntent.metadata.productId),
                amount: paymentIntent.amount / 100,
                currency: paymentIntent.currency.toUpperCase(),
                type: paymentIntent.metadata.type || 'UNKNOWN',
                userId: paymentIntent.metadata.userId || undefined
            }, 'WEBHOOK');
        }
        await db_1.db.webhookEvent.update({
            where: { eventId: event.id },
            data: { processed: true, processedAt: new Date() }
        });
        res.json({ received: true });
    }
    catch (error) {
        logger_1.logger.error({ error, eventId: event.id }, 'Stripe Webhook Processing Failed');
        // Return 500 to trigger Stripe Retry
        res.status(500).send('Webhook handler failed');
    }
});
// ============================================================================
// 2. DTONE WEBHOOK (Handles Status Updates & Automatic Refunds)
// ============================================================================
router.post('/dtone', ipWhitelist_1.dtoneIpWhitelist, // Security: Check IP
basicAuth_1.dtoneBasicAuth, // Security: Check Username/Pass
express_1.default.json(), async (req, res) => {
    const { external_id, status, id } = req.body;
    // A. Validate Payload
    if (!external_id || !status || !status.class?.id) {
        logger_1.logger.warn({ body: req.body }, '[DTOne Webhook] Invalid payload structure');
        return res.status(400).send('Invalid payload');
    }
    // B. Lookup Transaction
    const transaction = await db_1.db.transaction.findUnique({
        where: { externalId: external_id }
    });
    if (!transaction) {
        // Return 200 to stop DTOne from retrying for a transaction we don't have
        logger_1.logger.error({ external_id }, `[DTOne Webhook] Transaction not found`);
        return res.status(200).send('Transaction not found (Ignored)');
    }
    // C. Determine New Status
    const statusId = status.class.id;
    let newStatus;
    if (statusId === 7)
        newStatus = client_1.TransactionStatus.COMPLETED;
    else if ([3, 9].includes(statusId))
        newStatus = client_1.TransactionStatus.FAILED;
    // D. Idempotency: If status is already set, stop processing
    if (newStatus && transaction.status === newStatus) {
        return res.status(200).send('Already processed');
    }
    // E. Verify State Transition (Prevent overwriting final states)
    const validTransitions = {
        [client_1.TransactionStatus.INITIALIZED]: [client_1.TransactionStatus.PENDING, client_1.TransactionStatus.COMPLETED, client_1.TransactionStatus.FAILED],
        [client_1.TransactionStatus.PENDING]: [client_1.TransactionStatus.COMPLETED, client_1.TransactionStatus.FAILED],
        [client_1.TransactionStatus.PROCESSING]: [client_1.TransactionStatus.COMPLETED, client_1.TransactionStatus.FAILED],
        [client_1.TransactionStatus.COMPLETED]: [],
        [client_1.TransactionStatus.FAILED]: [client_1.TransactionStatus.REFUNDED],
        [client_1.TransactionStatus.REFUNDED]: [],
        [client_1.TransactionStatus.REFUND_FAILED]: []
    };
    if (newStatus && !validTransitions[transaction.status]?.includes(newStatus)) {
        logger_1.logger.warn({
            external_id,
            current: transaction.status,
            new: newStatus
        }, `[DTOne Webhook] Ignored transition`);
        return res.status(200).send('Invalid transition (Ignored)');
    }
    // F. Update Database & Handle Refunds (ATOMICALLY)
    if (newStatus) {
        // 🚨 CRITICAL REFUND LOGIC 🚨
        // Determine if we *intend* to refund based on the incoming status
        const needsRefund = newStatus === client_1.TransactionStatus.FAILED && transaction.status !== client_1.TransactionStatus.FAILED;
        // 1. Attempt Atomic Update (Optimistic Locking)
        // We only update if the status is currently what we think it is.
        const result = await db_1.db.transaction.updateMany({
            where: {
                externalId: external_id,
                status: transaction.status // 🔒 LOCK: Ensure nobody else changed it
            },
            data: {
                status: newStatus,
                dtoneTransactionId: id?.toString(),
                updatedAt: new Date()
            }
        });
        // If count is 0, the DB state changed while we were processing (Race Condition)
        if (result.count === 0) {
            logger_1.logger.warn({ external_id }, '[DTOne Webhook] Race condition detected. Transaction state changed concurrently.');
            return res.status(200).send('State mismatch (Ignored)');
        }
        logger_1.logger.info({ external_id, from: transaction.status, to: newStatus }, `[DTOne Webhook] Status Updated`);
        // 2. Execute Side Effects (Refund)
        // Only runs if we successfully updated the DB status to FAILED
        if (needsRefund) {
            logger_1.logger.info({ paymentId: transaction.paymentIntentId }, `[DTOne Webhook] Triggering Refund...`);
            const refund = await payment_1.paymentService.refundPayment(transaction.paymentIntentId);
            // Update DB again with the result of the refund
            const finalStatus = refund ? client_1.TransactionStatus.REFUNDED : client_1.TransactionStatus.REFUND_FAILED;
            await db_1.db.transaction.update({
                where: { id: transaction.id }, // Safe to use ID now as we own the record
                data: { status: finalStatus }
            });
            if (refund) {
                logger_1.logger.info({ paymentId: transaction.paymentIntentId }, `[DTOne Webhook] 💸 Refunded Successfully`);
            }
            else {
                logger_1.logger.error({ paymentId: transaction.paymentIntentId }, `[DTOne Webhook] ❌ Refund FAILED`);
            }
        }
    }
    return res.status(200).send('OK');
});
exports.default = router;
