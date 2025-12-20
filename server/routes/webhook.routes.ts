import express, { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { db } from '../db';
import { transactionService } from '../services/transactionService';
import { TransactionStatus } from '@prisma/client';
import { dtoneBasicAuth } from '../middleware/basicAuth';
import { dtoneIpWhitelist } from '../middleware/ipWhitelist';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' as any });

// STRIPE WEBHOOK
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

    const existingEvent = await db.webhookEvent.findUnique({
      where: { eventId: event.id }
    });

    if (existingEvent) return res.json({ received: true });

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

// DTONE WEBHOOK
router.post('/dtone', 
  dtoneIpWhitelist,    // Check IP (if configured)
  dtoneBasicAuth,      // Check Basic Auth
  express.json(), 
  async (req: Request, res: Response): Promise<any> => {
    console.log('🪝 [DTOne Webhook] Received:', JSON.stringify(req.body));

    const { external_id, status } = req.body;

    if (!external_id || !status) {
      return res.status(400).send('Invalid payload');
    }

    try {
      const statusId = status.class?.id;
      let newStatus: TransactionStatus | undefined;

      if (statusId === 7) newStatus = TransactionStatus.COMPLETED;
      else if ([3, 9].includes(statusId)) newStatus = TransactionStatus.FAILED;

      if (newStatus) {
        await db.transaction.update({
          where: { externalId: external_id },
          data: { status: newStatus }
        });
        console.log(`✅ [DTOne Webhook] Updated ${external_id} to ${newStatus}`);
      }

      return res.status(200).send('OK');
    } catch (err) {
      console.error('❌ [DTOne Webhook] Error:', err);
      return res.status(500).send('Error processing webhook');
    }
  }
);

export default router;
