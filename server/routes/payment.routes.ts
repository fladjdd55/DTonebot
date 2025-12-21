import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { db } from '../db';
import { paymentService } from '../payment';
import { dtoneService } from '../dtone';
import { transactionService } from '../services/transactionService';
import { pricingService } from '../services/pricingService';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { TransactionStatus } from '@prisma/client';
import { GLOBAL_MIN_USD, FALLBACK_MARGIN } from '../config';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' as any });

// ✅ Validation Schema
const purchaseSchema = z.object({
  productId: z.number().int().positive(),
  mobile: z.string().min(8).max(20), // Basic length check
  paymentId: z.string().startsWith('pi_'), // Must be a Stripe Payment Intent
  type: z.string().optional()
});

router.post('/create-payment-intent', optionalAuth, async (req: Request, res: Response): Promise<any> => {
  const { mobile, productId, type, customAmount } = req.body;
  const idempotencyKey = req.headers['idempotency-key'] as string;
  
  if (!idempotencyKey) return res.status(400).json({ error: "Idempotency key required" });

  try {
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(400).json({ error: 'Invalid product' });

    // ✅ USE PRICING SERVICE (Replaces manual math)
    const pricing = pricingService.calculatePrice(product, customAmount);

    if (pricing.isBelowMin) {
      return res.status(400).json({ error: `Min order is $${pricing.minRequired}` });
    }

    const result = await paymentService.createPaymentIntent(pricing.finalCharge, 'USD', {
      productId: Number(productId),
      type,
      userId: (req as any).user?.id,
      localAmount: pricing.localAmount.toString()
    }, idempotencyKey);

    await db.transaction.create({
      data: {
        externalId: `init_${result.id}`,
        paymentIntentId: result.id,
        mobile,
        productId: Number(productId),
        amount: pricing.finalCharge,
        currency: 'USD',
        productType: type,
        status: TransactionStatus.INITIALIZED,
        userId: (req as any).user?.id,
        processedVia: 'API' 
      }
    });

    res.json({ 
      ...result, 
      chargeAmount: pricing.finalCharge,
      localAmount: pricing.localAmount,
      currency: product.currency,
    });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: "Duplicate request" });
    res.status(500).json({ error: error.message });
  }
});

router.post('/purchase', optionalAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const parsed = purchaseSchema.safeParse(req.body);
    
    if (!parsed.success) {
      console.warn('[Purchase] Invalid Request:', parsed.error.format());
      return res.status(400).json({ error: 'Invalid request parameters' });
    }

    const { productId, mobile, paymentId, type } = req.body;
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
    
    if (paymentIntent.status !== 'succeeded') return res.status(403).json({ error: 'Not paid' });

    const result = await transactionService.processPurchase({
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
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/transaction/:paymentId', async (req, res): Promise<any> => {
  try {
    const txn = await db.transaction.findUnique({ where: { paymentIntentId: req.params.paymentId } });
    
    if (!txn) return res.status(404).json({ error: "Transaction not found" });

    // SELF-HEALING: If stuck in PENDING, ask DTOne for an update
    if (txn.status === TransactionStatus.PENDING && txn.externalId.startsWith('txn_')) {
      const check = await dtoneService.getTransaction(txn.externalId);
      
      if (check.success && check.data) {
        let newStatus: TransactionStatus = txn.status;
        const sid = check.data.statusId;

        if (sid === 7) newStatus = TransactionStatus.COMPLETED;
        else if ([3, 9].includes(sid)) newStatus = TransactionStatus.FAILED;

        if (newStatus !== txn.status) {
          await db.transaction.update({
            where: { id: txn.id },
            data: { status: newStatus }
          });
          return res.json({ status: newStatus, externalId: txn.externalId });
        }
      }
    }

    return res.json({ status: txn.status, externalId: txn.externalId });
  } catch (error) {
    console.error("Status Check Error:", error);
    return res.status(500).json({ error: "Failed to check status" });
  }
});

router.get('/user/transactions', requireAuth, async (req: any, res: Response): Promise<any> => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = 20;
  const [transactions, total] = await Promise.all([
    db.transaction.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
         product: { select: { name: true, currency: true } }
      }
    }),
    db.transaction.count({ where: { userId: req.user!.id } })
  ]);
  return res.json({ transactions, pagination: { page, limit, total } });
});

// Define what the frontend should receive
interface PriceResponse {
  chargeAmount: number;
  localAmount: number;
  currency: string;
  productName: string;
}

router.post('/calculate-price', requireAuth, async (req: Request, res: Response): Promise<any> => {
  try {
    const { productId, customAmount } = req.body;

    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(400).json({ error: 'Invalid product' });

    // ✅ USE PRICING SERVICE
    const pricing = pricingService.calculatePrice(product, customAmount);

    if (pricing.isBelowMin) {
       return res.status(400).json({ error: `Min order is $${pricing.minRequired}` });
    }

    const response: PriceResponse = {
      chargeAmount: pricing.finalCharge,
      localAmount: pricing.localAmount,
      currency: product.currency,
      productName: product.name,
    };

    res.json(response);

  } catch (error) {
    console.error('Price calculation failed:', error);
    res.status(500).json({ error: 'Failed to calculate price' });
  }
});

export default router;
