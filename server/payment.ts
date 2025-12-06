import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("⚠️  STRIPE_SECRET_KEY is missing in .env");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any, // Use latest version
});

export const paymentService = {
  /**
   * Creates a Payment Intent for the Stripe Elements sheet
   * @param amount Amount in standard units (e.g., 10.50)
   * @param currency Currency code (e.g., 'USD')
   */
  async createPaymentIntent(amount: number, currency: string) {
    try {
      // Stripe expects amounts in "cents" (smallest unit)
      // e.g., $10.00 -> 1000 cents
      // Note: Zero-decimal currencies like JPY need special handling, 
      // but for simplicity we assume standard 100-based currencies here.
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
      };
    } catch (error: any) {
      console.error('Stripe Error:', error.message);
      throw new Error(error.message);
    }
  }
};
