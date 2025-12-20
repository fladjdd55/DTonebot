import express, { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { db } from '../db';
import { transactionService } from '../services/transactionService';
import { paymentService } from '../payment'; // ✅ Import Payment Service for refunds
import { TransactionStatus } from '@prisma/client';
import { dtoneBasicAuth } from '../middleware/basicAuth';
import { dtoneIpWhitelist } from '../middleware/ipWhitelist';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' as any });

// ============================================================================
// 1. STRIPE WEBHOOK (Handles Incoming Money)
// ============================================================================
router.post('/stripe',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response): Promise<any> => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret || !sig) return res.status(400).send('Webhook Error');

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Idempotency: Ignore events we already processed
    const existingEvent = await db.webhookEvent.findUnique({
      where: { eventId: event.id }
    });
    if (existingEvent) return res.json({ received: true });

    // Log the event
    await db.webhookEvent.create({
      data: {
        eventId: event.id,
        eventType: event.type,
        payload: event.data.object as any,
        processed: false
      }
    });

    try {
      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        
        await transactionService.processPurchase({
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

      await db.webhookEvent.update({
        where: { eventId: event.id },
        data: { processed: true, processedAt: new Date() }
      });

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook handler failed:', error);
      res.status(500).send('Webhook handler failed');
    }
  }
);

// ============================================================================
// 2. DTONE WEBHOOK (Handles Status Updates & Automatic Refunds)
// ============================================================================
router.post('/dtone', 
  dtoneIpWhitelist,    // Security: Check IP
  dtoneBasicAuth,      // Security: Check Username/Pass
  express.json(), 
  async (req: Request, res: Response): Promise<any> => {
    const { external_id, status, id } = req.body;
    
    // A. Validate Payload
    if (!external_id || !status || !status.class?.id) {
      console.warn('[DTOne Webhook] Invalid payload structure');
      return res.status(400).send('Invalid payload');
    }
    
    // B. Lookup Transaction
    const transaction = await db.transaction.findUnique({
      where: { externalId: external_id }
    });
    
    if (!transaction) {
      // Return 200 to stop DTOne from retrying for a transaction we don't have
      console.error(`[DTOne Webhook] Transaction not found: ${external_id}`);
      return res.status(200).send('Transaction not found (Ignored)');
    }

    // C. Determine New Status
    const statusId = status.class.id;
    let newStatus: TransactionStatus | undefined;
    
    if (statusId === 7) newStatus = TransactionStatus.COMPLETED;
    else if ([3, 9].includes(statusId)) newStatus = TransactionStatus.FAILED;

    // D. Idempotency: If status is already set, stop processing
    if (newStatus && transaction.status === newStatus) {
      return res.status(200).send('Already processed');
    }

    // E. Verify State Transition (Prevent overwriting final states)
    const validTransitions: Record<TransactionStatus, TransactionStatus[]> = {
      [TransactionStatus.INITIALIZED]: [TransactionStatus.PENDING, TransactionStatus.COMPLETED, TransactionStatus.FAILED],
      [TransactionStatus.PENDING]: [TransactionStatus.COMPLETED, TransactionStatus.FAILED],
      [TransactionStatus.PROCESSING]: [TransactionStatus.COMPLETED, TransactionStatus.FAILED],
      [TransactionStatus.COMPLETED]: [],
      [TransactionStatus.FAILED]: [TransactionStatus.REFUNDED],
      [TransactionStatus.REFUNDED]: [],
      [TransactionStatus.REFUND_FAILED]: []
    };
    
    if (newStatus && !validTransitions[transaction.status]?.includes(newStatus)) {
      console.warn(`[DTOne Webhook] Ignored transition: ${transaction.status} -> ${newStatus}`);
      return res.status(200).send('Invalid transition (Ignored)');
    }

    // F. Update Database & Handle Refunds
    if (newStatus) {
      
      // 🚨 CRITICAL REFUND LOGIC 🚨
      // If DTOne says "FAILED" but we haven't refunded yet, do it now.
      if (newStatus === TransactionStatus.FAILED && transaction.status !== TransactionStatus.FAILED) {
        console.log(`[DTOne Webhook] ⚠️ Transaction ${external_id} failed remotely. Triggering Refund...`);
        
        const refund = await paymentService.refundPayment(transaction.paymentIntentId);
        
        if (refund) {
          console.log(`[DTOne Webhook] 💸 Refunded ${transaction.paymentIntentId}`);
          newStatus = TransactionStatus.REFUNDED;
        } else {
          console.error(`[DTOne Webhook] ❌ Refund FAILED for ${transaction.paymentIntentId}`);
          newStatus = TransactionStatus.REFUND_FAILED; // Needs manual Admin fix
        }
      }

      await db.transaction.update({
        where: { externalId: external_id },
        data: { 
          status: newStatus,
          dtoneTransactionId: id?.toString(),
          updatedAt: new Date()
        }
      });
      
      console.log(`✅ [DTOne Webhook] Updated ${external_id} to ${newStatus}`);
    }
    
    return res.status(200).send('OK');
  }
);

export default router;
