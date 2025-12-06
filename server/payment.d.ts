export declare const paymentService: {
    /**
     * Creates a Payment Intent for the Stripe Elements sheet
     * @param amount Amount in standard units (e.g., 10.50)
     * @param currency Currency code (e.g., 'USD')
     */
    createPaymentIntent(amount: number, currency: string): Promise<{
        clientSecret: string | null;
    }>;
};
