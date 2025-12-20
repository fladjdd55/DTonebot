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
const client_1 = require("@prisma/client");
const basicAuth_1 = require("../middleware/basicAuth");
const ipWhitelist_1 = require("../middleware/ipWhitelist");
const router = (0, express_1.Router)();
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' });
// STRIPE WEBHOOK
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
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    const existingEvent = await db_1.db.webhookEvent.findUnique({
        where: { eventId: event.id }
    });
    if (existingEvent)
        return res.json({ received: true });
    await db_1.db.webhookEvent.create({
        data: {
            eventId: event.id,
            eventType: event.type,
            payload: event.data.object,
            processed: false
        }
    });
    try {
        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;
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
        console.error('Webhook handler failed:', error);
        res.status(500).send('Webhook handler failed');
    }
});
// DTONE WEBHOOK
router.post('/dtone', ipWhitelist_1.dtoneIpWhitelist, // Check IP (if configured)
basicAuth_1.dtoneBasicAuth, // Check Basic Auth
express_1.default.json(), async (req, res) => {
    console.log('🪝 [DTOne Webhook] Received:', JSON.stringify(req.body));
    const { external_id, status } = req.body;
    if (!external_id || !status) {
        return res.status(400).send('Invalid payload');
    }
    try {
        const statusId = status.class?.id;
        let newStatus;
        if (statusId === 7)
            newStatus = client_1.TransactionStatus.COMPLETED;
        else if ([3, 9].includes(statusId))
            newStatus = client_1.TransactionStatus.FAILED;
        if (newStatus) {
            await db_1.db.transaction.update({
                where: { externalId: external_id },
                data: { status: newStatus }
            });
            console.log(`✅ [DTOne Webhook] Updated ${external_id} to ${newStatus}`);
        }
        return res.status(200).send('OK');
    }
    catch (err) {
        console.error('❌ [DTOne Webhook] Error:', err);
        return res.status(500).send('Error processing webhook');
    }
});
exports.default = router;
