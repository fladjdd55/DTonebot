// server/payment.ts

import Stripe from 'stripe';
import dotenv from 'dotenv';
import axios from 'axios'; 

dotenv.config();

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("⚠️  STRIPE_SECRET_KEY is missing in .env");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

// ✅ NEW: Simple Notification Helper (Discord/Slack)
async function sendAdminAlert(message: string) {
  const webhookUrl = process.env.ADMIN_WEBHOOK_URL; 
  if (!webhookUrl) {
    console.error(`[Alert] 🚨 (Webhook not configured): ${message}`);
    return;
  }
  
  try {
    await axios.post(webhookUrl, { content: `🚨 **Critical Payment Error:** ${message}` });
  } catch (err) {
    console.error('[Alert] Failed to send webhook:', err);
  }
}

export const paymentService = {
  /**
   * Creates a Payment Intent and returns ID + Secret
   */
  async createPaymentIntent(
    amount: number, 
    currency: string, 
    metadata?: { mobile: string, productId: number, type: string },
    idempotencyKey?: string // 👈 Accepted here
  ) {
    try {
      const amountInCents = Math.round(amount * 100);

      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: amountInCents,
          currency: currency.toLowerCase(),
          automatic_payment_methods: { enabled: true },
          metadata: {
            mobile: metadata?.mobile || '',
            productId: metadata?.productId?.toString() || '',
            type: metadata?.type || ''
          }
        },
        {
          idempotencyKey // 👈 Passed to Stripe
        }
      );

      return {
        clientSecret: paymentIntent.client_secret,
        id: paymentIntent.id 
      };
    } catch (error: any) {
      console.error('Stripe Error:', error.message);
      throw new Error(error.message);
    }
  },

  /**
   * Refunds a payment if DTOne transaction fails
   */
  async refundPayment(paymentIntentId: string) {
    try {
      console.log(`[Stripe] 💸 Attempting refund for ${paymentIntentId}...`);
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
      });
      console.log(`[Stripe] ✅ Refund successful: ${refund.id}`);
      return refund;
    } catch (error: any) {
      const errorMsg = `Refund FAILED for Payment ${paymentIntentId}. Reason: ${error.message}`;
      console.error(`[Stripe] ❌ ${errorMsg}`);
      
      // Notify Admin immediately so they can fix it manually
      await sendAdminAlert(errorMsg); 
      
      return null;
    }
  }
};
