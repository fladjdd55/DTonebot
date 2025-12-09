import Stripe from 'stripe';
export declare const paymentService: {
    /**
     * Creates a Payment Intent and returns ID + Secret
     */
    createPaymentIntent(amount: number, currency: string, metadata?: {
        mobile: string;
        productId: number;
        type: string;
    }): Promise<{
        clientSecret: string | null;
        id: string;
    }>;
    /**
     * Refunds a payment if DTOne transaction fails
     */
    refundPayment(paymentIntentId: string): Promise<Stripe.Response<Stripe.Refund> | null>;
};
