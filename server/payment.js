"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentService = void 0;
const stripe_1 = __importDefault(require("stripe"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
if (!process.env.STRIPE_SECRET_KEY) {
    console.warn("⚠️  STRIPE_SECRET_KEY is missing in .env");
}
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16', // Use latest version
});
exports.paymentService = {
    /**
     * Creates a Payment Intent for the Stripe Elements sheet
     * @param amount Amount in standard units (e.g., 10.50)
     * @param currency Currency code (e.g., 'USD')
     */
    async createPaymentIntent(amount, currency) {
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
        }
        catch (error) {
            console.error('Stripe Error:', error.message);
            throw new Error(error.message);
        }
    }
};
