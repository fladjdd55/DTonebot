"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stripe_1 = __importDefault(require("stripe"));
const zod_1 = require("zod");
const db_1 = require("../db");
const payment_1 = require("../payment");
const dtone_1 = require("../dtone");
const transactionService_1 = require("../services/transactionService");
const auth_1 = require("../middleware/auth");
const client_1 = require("@prisma/client");
const config_1 = require("../config");
const router = (0, express_1.Router)();
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' });
// ✅ Validation Schema
const purchaseSchema = zod_1.z.object({
    productId: zod_1.z.number().int().positive(),
    mobile: zod_1.z.string().min(8).max(20), // Basic length check
    paymentId: zod_1.z.string().startsWith('pi_'), // Must be a Stripe Payment Intent
    type: zod_1.z.string().optional()
});
router.post('/create-payment-intent', auth_1.optionalAuth, async (req, res) => {
    const { mobile, productId, type, customAmount } = req.body;
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey)
        return res.status(400).json({ error: "Idempotency key required" });
    try {
        const product = await db_1.db.product.findUnique({ where: { id: productId } });
        if (!product)
            return res.status(400).json({ error: 'Invalid product' });
        let cost = product.costPrice || product.amount || 0;
        if (product.type.includes('RANGE') && customAmount) {
            const unitCost = (product.costPriceMin || 0) / (product.minAmount || 1);
            cost = customAmount * unitCost;
        }
        const finalCharge = cost * config_1.FALLBACK_MARGIN;
        if (finalCharge < config_1.GLOBAL_MIN_USD)
            return res.status(400).json({ error: `Min order is $${config_1.GLOBAL_MIN_USD}` });
        const localAmount = (product.type.includes('RANGE') && customAmount)
            ? customAmount
            : (product.amount || 0);
        const result = await payment_1.paymentService.createPaymentIntent(finalCharge, 'USD', {
            productId: Number(productId),
            type,
            userId: req.user?.id,
            localAmount: localAmount.toString()
        }, idempotencyKey);
        await db_1.db.transaction.create({
            data: {
                externalId: `init_${result.id}`,
                paymentIntentId: result.id,
                mobile,
                productId: Number(productId),
                amount: finalCharge,
                currency: 'USD',
                productType: type,
                status: client_1.TransactionStatus.INITIALIZED,
                userId: req.user?.id,
                processedVia: 'API'
            }
        });
        res.json({
            ...result,
            chargeAmount: finalCharge,
            localAmount: localAmount,
            currency: product.currency,
        });
    }
    catch (error) {
        if (error.code === 'P2002')
            return res.status(409).json({ error: "Duplicate request" });
        res.status(500).json({ error: error.message });
    }
});
router.post('/purchase', auth_1.optionalAuth, async (req, res) => {
    try {
        const parsed = purchaseSchema.safeParse(req.body);
        if (!parsed.success) {
            console.warn('[Purchase] Invalid Request:', parsed.error.format());
            return res.status(400).json({ error: 'Invalid request parameters' });
        }
        const { productId, mobile, paymentId, type } = req.body;
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
        if (paymentIntent.status !== 'succeeded')
            return res.status(403).json({ error: 'Not paid' });
        const result = await transactionService_1.transactionService.processPurchase({
            paymentId,
            mobile,
            email: paymentIntent.receipt_email || undefined,
            productId,
            amount: paymentIntent.amount / 100,
            currency: paymentIntent.currency.toUpperCase(),
            type: type || 'UNKNOWN',
            userId: paymentIntent.metadata.userId || undefined
        }, 'API');
        return res.json(result);
    }
    catch {
        return res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/transaction/:paymentId', async (req, res) => {
    try {
        const txn = await db_1.db.transaction.findUnique({ where: { paymentIntentId: req.params.paymentId } });
        if (!txn)
            return res.status(404).json({ error: "Transaction not found" });
        // SELF-HEALING: If stuck in PENDING, ask DTOne for an update
        if (txn.status === client_1.TransactionStatus.PENDING && txn.externalId.startsWith('txn_')) {
            const check = await dtone_1.dtoneService.getTransaction(txn.externalId);
            if (check.success && check.data) {
                let newStatus = txn.status;
                const sid = check.data.statusId;
                if (sid === 7)
                    newStatus = client_1.TransactionStatus.COMPLETED;
                else if ([3, 9].includes(sid))
                    newStatus = client_1.TransactionStatus.FAILED;
                if (newStatus !== txn.status) {
                    await db_1.db.transaction.update({
                        where: { id: txn.id },
                        data: { status: newStatus }
                    });
                    return res.json({ status: newStatus, externalId: txn.externalId });
                }
            }
        }
        return res.json({ status: txn.status, externalId: txn.externalId });
    }
    catch (error) {
        console.error("Status Check Error:", error);
        return res.status(500).json({ error: "Failed to check status" });
    }
});
router.get('/user/transactions', auth_1.requireAuth, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const [transactions, total] = await Promise.all([
        db_1.db.transaction.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
            include: {
                product: { select: { name: true, currency: true } }
            }
        }),
        db_1.db.transaction.count({ where: { userId: req.user.id } })
    ]);
    return res.json({ transactions, pagination: { page, limit, total } });
});
router.post('/calculate-price', auth_1.requireAuth, async (req, res) => {
    try {
        const { productId, customAmount } = req.body;
        const product = await db_1.db.product.findUnique({ where: { id: productId } });
        if (!product)
            return res.status(400).json({ error: 'Invalid product' });
        // 1. Calculate Cost (Reuse logic from /create-payment-intent to keep prices consistent)
        let cost = product.costPrice || product.amount || 0;
        // Handle Ranged Products (Custom Amount)
        if (product.type.includes('RANGE') && customAmount) {
            const unitCost = (product.costPriceMin || 0) / (product.minAmount || 1);
            cost = customAmount * unitCost;
        }
        // 2. Apply Margin
        const finalCharge = cost * config_1.FALLBACK_MARGIN;
        // 3. Enforce Global Minimum
        if (finalCharge < config_1.GLOBAL_MIN_USD) {
            return res.status(400).json({ error: `Min order is $${config_1.GLOBAL_MIN_USD}` });
        }
        // 4. Determine Local Amount (what the user receives)
        const localAmount = (product.type.includes('RANGE') && customAmount)
            ? customAmount
            : (product.amount || 0);
        // ✅ FIX: Only send safe public data (No margins, no base costs)
        const response = {
            chargeAmount: finalCharge,
            localAmount: localAmount,
            currency: product.currency,
            productName: product.name,
        };
        res.json(response);
    }
    catch (error) {
        console.error('Price calculation failed:', error);
        res.status(500).json({ error: 'Failed to calculate price' });
    }
});
exports.default = router;
