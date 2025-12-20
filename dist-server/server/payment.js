"use strict";
// server/payment.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentService = void 0;
const stripe_1 = __importDefault(require("stripe"));
const dotenv_1 = __importDefault(require("dotenv"));
const axios_1 = __importDefault(require("axios"));
dotenv_1.default.config();
if (!process.env.STRIPE_SECRET_KEY) {
    console.warn("⚠️  STRIPE_SECRET_KEY is missing in .env");
}
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16',
});
// Simple Notification Helper (Discord/Slack)
async function sendAdminAlert(message) {
    const webhookUrl = process.env.ADMIN_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error(`[Alert] 🚨 (Webhook not configured): ${message}`);
        return;
    }
    try {
        await axios_1.default.post(webhookUrl, { content: `🚨 **Critical Payment Error:** ${message}` });
    }
    catch (err) {
        console.error('[Alert] Failed to send webhook:', err);
    }
}
exports.paymentService = {
    /**
     * Creates a Payment Intent and returns ID + Secret
     * Now supports userId for linking transactions to accounts
     */
    async createPaymentIntent(amount, currency, metadata, idempotencyKey) {
        try {
            const amountInCents = Math.round(amount * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amountInCents,
                currency: currency.toLowerCase(),
                automatic_payment_methods: { enabled: true },
                metadata: {
                    mobile: metadata?.mobile || '',
                    productId: metadata?.productId?.toString() || '',
                    type: metadata?.type || '',
                    userId: metadata?.userId || '',
                    localAmount: metadata?.localAmount || '' // ✅ ADDED: Pass to Stripe
                }
            }, {
                idempotencyKey
            });
            return {
                clientSecret: paymentIntent.client_secret,
                id: paymentIntent.id
            };
        }
        catch (error) {
            console.error('Stripe Error:', error.message);
            throw new Error(error.message);
        }
    },
    /**
     * Refunds a payment if DTOne transaction fails
     */
    async refundPayment(paymentIntentId) {
        try {
            console.log(`[Stripe] 💸 Attempting refund for ${paymentIntentId}...`);
            const idempotencyKey = `refund_${paymentIntentId}_${Date.now()}`;
            const refund = await stripe.refunds.create({
                payment_intent: paymentIntentId,
            }, {
                idempotencyKey: idempotencyKey // ✅ CRITICAL: Prevents double refunds
            });
            console.log(`[Stripe] ✅ Refund successful: ${refund.id}`);
            return refund;
        }
        catch (error) {
            const errorMsg = `Refund FAILED for Payment ${paymentIntentId}. Reason: ${error.message}`;
            console.error(`[Stripe] ❌ ${errorMsg}`);
            // Notify Admin immediately so they can fix it manually
            await sendAdminAlert(errorMsg);
            return null;
        }
    }
};
