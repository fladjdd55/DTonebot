import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("⚠️  STRIPE_SECRET_KEY is missing in .env");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

export const paymentService = {
  /**
   * Creates a Payment Intent and returns ID + Secret
   */
  async createPaymentIntent(amount: number, currency: string) {
    try {
      const amountInCents = Math.round(amount * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: currency.toLowerCase(),
        automatic_payment_methods: {
          enabled: true,
        },
      });

      return {
        clientSecret: paymentIntent.client_secret,
        id: paymentIntent.id // 👈 Sending ID to frontend
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
      console.error('[Stripe] ❌ Refund Failed:', error.message);
      return null;
    }
  }
};
