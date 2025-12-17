// server/Routes.ts - FIXED VERSION
// Key Changes:
// 1. Server-only price calculation
// 2. Price verification BEFORE payment
// 3. Simplified purchase flow (webhook-first)
// 4. Database transactions for atomicity
// 5. Better error handling

import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import Stripe from 'stripe';
import cron from 'node-cron';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { z } from 'zod';

import { requireAuth, optionalAuth } from './middleware/auth';
import { dtoneService } from './dtone';
import { paymentService } from './payment';
import { authService } from './auth';
import { db } from './db';
import { RedisService } from './services/redis'; // NEW: For webhook deduplication

const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' as any });

const FALLBACK_MARGIN = Number(process.env.DTONE_FALLBACK_MARGIN) || 1.15;
const GLOBAL_MIN_USD = Number(process.env.VITE_MIN_USD_ORDER || 5);

// ============================================================
// 🔧 FIX #1: PRICE CALCULATION SERVICE (Server-Only)
// ============================================================

class PriceCalculationService {
  /**
   * Calculate exact USD price user should pay
   * Single source of truth - used by both intent creation and verification
   */
  static calculatePrice(product: any, customAmount?: number): {
    usdPrice: number;
    localAmount: number;
    currency: string;
    breakdown: {
      baseCost: number;
      margin: number;
      finalPrice: number;
    };
  } {
    const isRanged = product.type?.includes('RANGE') || 
                     (product.minAmount && product.maxAmount && product.minAmount !== product.maxAmount);

    let baseCostUsd = 0;
    let localAmount = 0;
    let currency = product.currency;

    if (isRanged) {
      if (!customAmount) {
        throw new Error('Custom amount required for ranged products');
      }

      const min = product.minAmount || 0;
      const max = product.maxAmount || Infinity;
      
      if (customAmount < min || customAmount > max) {
        throw new Error(`Amount must be between ${min} and ${max} ${currency}`);
      }

      // Calculate proportional cost
      const costMin = product.costPriceMin || product.costPrice || 0;
      const unitMin = product.minAmount || 1;
      baseCostUsd = customAmount * (costMin / unitMin);
      localAmount = customAmount;

    } else {
      // Fixed product
      baseCostUsd = product.costPrice || product.amount || 0;
      localAmount = product.amount || 0;
    }

    // Apply margin
    const finalPrice = baseCostUsd * FALLBACK_MARGIN;

    // Enforce minimum
    if (finalPrice < GLOBAL_MIN_USD) {
      throw new Error(`Minimum order is $${GLOBAL_MIN_USD} USD`);
    }

    return {
      usdPrice: finalPrice,
      localAmount,
      currency,
      breakdown: {
        baseCost: baseCostUsd,
        margin: FALLBACK_MARGIN,
        finalPrice
      }
    };
  }

  /**
   * Get adjusted minimum for ranged products considering USD minimum
   */
  static getEffectiveMin(product: any): number {
    if (!product.type?.includes('RANGE')) {
      return product.amount || 0;
    }

    let min = product.minAmount || 0;
    
    if (!product.costPrice || !product.minAmount) {
      return min;
    }

    // Calculate local currency equivalent of $5 USD
    const costPerUnit = product.costPrice / product.minAmount;
    const minRequiredLocal = GLOBAL_MIN_USD / (costPerUnit * FALLBACK_MARGIN);
    
    return Math.max(min, Math.ceil(minRequiredLocal));
  }
}

// ============================================================
// 🔧 FIX #2: WEBHOOK DEDUPLICATION WITH REDIS
// ============================================================

const redis = new RedisService();

async function isWebhookProcessed(eventId: string): Promise<boolean> {
  const key = `webhook:${eventId}`;
  const exists = await redis.get(key);
  if (exists) return true;
  
  // Mark as processed for 24 hours
  await redis.set(key, '1', 86400);
  return false;
}

// ============================================================
// 🔧 FIX #3: SIMPLIFIED PURCHASE FLOW (Webhook-Primary)
// ============================================================

/**
 * Process purchase with database transaction for atomicity
 * Called ONLY from webhook (API just creates intent)
 */
async function processWebhookPurchase(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const paymentId = paymentIntent.id;
  const mobile = paymentIntent.metadata.mobile;
  const productId = Number(paymentIntent.metadata.productId);
  const localAmount = paymentIntent.metadata.localAmount;
  const userId = paymentIntent.metadata.userId || null;

  console.log(`[Webhook] Processing: ${paymentId}`);

  // Use Prisma transaction for atomicity
  await db.$transaction(async (tx) => {
    // Check if already processed
    const existing = await tx.transaction.findUnique({
      where: { paymentIntentId: paymentId }
    });

    if (existing) {
      if (existing.status === 'COMPLETED') {
        console.log(`[Webhook] Already completed: ${paymentId}`);
        return;
      }
      if (['FAILED', 'REFUNDED'].includes(existing.status)) {
        console.log(`[Webhook] Already failed/refunded: ${paymentId}`);
        return;
      }
    }

    // Create/update transaction record first
    const txnRecord = await tx.transaction.upsert({
      where: { paymentIntentId: paymentId },
      create: {
        externalId: `pending_${paymentId}`,
        paymentIntentId: paymentId,
        paymentId: paymentId,
        mobile,
        productId,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        productType: paymentIntent.metadata.type || 'UNKNOWN',
        status: 'PROCESSING',
        processedVia: 'WEBHOOK',
        userId
      },
      update: {
        status: 'PROCESSING',
        updatedAt: new Date()
      }
    });

    // Call DTOne API
    const callbackUrl = process.env.DTONE_CALLBACK_URL
      ? `${process.env.DTONE_CALLBACK_URL}/api/hooks/dtone`
      : undefined;

    const result = await dtoneService.purchaseProduct(
      productId,
      mobile,
      localAmount ? parseFloat(localAmount) : 0,
      paymentIntent.currency.toUpperCase(),
      paymentIntent.metadata.type,
      callbackUrl
    );

    // Determine final status
    let finalStatus = 'PENDING';
    let shouldRefund = false;

    if (!result.success || !result.data) {
      console.error(`[Webhook] DTOne failed: ${result.error}`);
      finalStatus = 'FAILED';
      shouldRefund = true;
    } else {
      const statusId = result.data.statusId;
      
      if (statusId === 7) {
        finalStatus = 'COMPLETED';
      } else if ([3, 9].includes(statusId || 0)) {
        finalStatus = 'FAILED';
        shouldRefund = true;
      } else {
        finalStatus = 'PENDING'; // Awaiting DTOne callback
      }
    }

    // Update transaction with final status
    await tx.transaction.update({
      where: { id: txnRecord.id },
      data: {
        status: finalStatus,
        externalId: result.data?.externalId || `failed_${paymentId}`,
        updatedAt: new Date()
      }
    });

    // Handle refund outside transaction
    if (shouldRefund) {
      // Schedule refund in background (don't block webhook response)
      setImmediate(async () => {
        const refund = await paymentService.refundPayment(paymentId);
        await db.transaction.update({
          where: { paymentIntentId: paymentId },
          data: { status: refund ? 'REFUNDED' : 'REFUND_FAILED' }
        });
      });
    }
  }, {
    maxWait: 10000, // 10 seconds max wait for lock
    timeout: 30000  // 30 seconds total timeout
  });
}

// ============================================================
// 🔧 FIX #4: STRIPE WEBHOOK (With Deduplication)
// ============================================================

app.post('/api/hooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response): Promise<any> => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret || !sig) {
      return res.status(400).send('Webhook Error: Missing signature');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error('[Webhook] Signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Check if already processed (Redis-based)
    if (await isWebhookProcessed(event.id)) {
      console.log(`[Webhook] Duplicate event ignored: ${event.id}`);
      return res.json({ received: true, duplicate: true });
    }

    try {
      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        
        // Process in background, respond immediately
        setImmediate(() => processWebhookPurchase(paymentIntent));
        
        return res.json({ received: true });
      }

      // Handle other events
      if (event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await db.transaction.updateMany({
          where: { paymentIntentId: paymentIntent.id },
          data: { status: 'PAYMENT_FAILED' }
        });
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error('[Webhook] Processing error:', error);
      res.status(500).send('Webhook handler failed');
    }
  }
);

app.use(express.json());

// ============================================================
// 🔧 FIX #5: SECURE PAYMENT INTENT (Server-Side Price Calc)
// ============================================================

app.post('/api/create-payment-intent', 
  optionalAuth, 
  async (req: Request, res: Response): Promise<any> => {
    const { mobile, productId, type, customAmount } = req.body;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    if (!productId || !mobile) {
      return res.status(400).json({ error: 'Product ID and mobile required' });
    }

    try {
      // 1. Fetch product from trusted source
      const product = await db.product.findUnique({ where: { id: productId } });
      
      if (!product) {
        return res.status(400).json({ error: 'Product not found' });
      }

      // 2. Calculate price server-side (ONLY source of truth)
      let priceCalc;
      try {
        priceCalc = PriceCalculationService.calculatePrice(product, customAmount);
      } catch (err: any) {
        return res.status(400).json({ error: err.message });
      }

      // 3. Create payment intent with calculated price
      const result = await paymentService.createPaymentIntent(
        priceCalc.usdPrice,
        'USD', // Always charge in USD
        {
          mobile,
          productId: productId.toString(),
          type: type || product.type,
          userId: req.user?.id,
          localAmount: priceCalc.localAmount.toString()
        },
        idempotencyKey
      );

      // 4. Return with price breakdown for transparency
      return res.json({
        ...result,
        isGuest: !req.user,
        userId: req.user?.id,
        chargeAmount: priceCalc.usdPrice,
        localAmount: priceCalc.localAmount,
        currency: priceCalc.currency,
        breakdown: priceCalc.breakdown
      });

    } catch (error: any) {
      console.error('[Payment Intent] Error:', error);
      return res.status(500).json({ error: 'Failed to create payment intent' });
    }
  }
);

// ============================================================
// 🔧 FIX #6: SIMPLIFIED PURCHASE API (Intent Only)
// ============================================================

const purchaseSchema = z.object({
  productId: z.number().int().positive(),
  mobile: z.string().min(7).max(15),
  amount: z.number().positive().optional(),
  unit: z.string().length(3).optional(),
  paymentId: z.string().startsWith("pi_"),
  type: z.string().optional()
});

app.post('/api/purchase', 
  optionalAuth, 
  async (req: Request, res: Response): Promise<any> => {
    try {
      const { productId, mobile, paymentId } = purchaseSchema.parse(req.body);

      // 1. Verify payment intent exists and succeeded
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
      
      if (paymentIntent.status !== 'succeeded') {
        return res.status(403).json({ 
          error: 'Payment not completed',
          status: paymentIntent.status 
        });
      }

      // 2. Verify ownership (prevent hijacking)
      const originalPayerId = paymentIntent.metadata?.userId;
      const currentUser = req.user?.id;
      
      if (originalPayerId && currentUser && originalPayerId !== currentUser) {
        console.error(`[Security] Payment hijacking attempt: ${paymentId}`);
        return res.status(403).json({ 
          error: 'Security violation: Payment ownership mismatch' 
        });
      }

      // 3. Check if already being processed
      const existing = await db.transaction.findUnique({
        where: { paymentIntentId: paymentId }
      });

      if (existing) {
        // Return current status
        return res.json({
          success: existing.status === 'COMPLETED',
          status: existing.status,
          externalId: existing.externalId,
          message: 'Transaction already processed',
          alreadyProcessed: true
        });
      }

      // 4. Return pending - webhook will complete
      return res.json({
        success: true,
        status: 'PENDING',
        message: 'Payment confirmed. Processing recharge...',
        paymentId
      });

    } catch (error: any) {
      console.error('[Purchase] Error:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data' });
      }
      
      return res.status(500).json({ error: 'Purchase failed' });
    }
  }
);

// ============================================================
// 🔧 FIX #7: TRANSACTION STATUS WITH POLLING
// ============================================================

app.get('/api/transaction/:paymentId', 
  async (req: Request, res: Response): Promise<any> => {
    const { paymentId } = req.params;
    
    try {
      const txn = await db.transaction.findUnique({
        where: { paymentIntentId: paymentId },
        select: {
          status: true,
          externalId: true,
          amount: true,
          currency: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!txn) {
        return res.json({ 
          status: 'PENDING', 
          message: 'Transaction not yet created' 
        });
      }

      return res.json(txn);

    } catch (error: any) {
      console.error('[Status Check] Error:', error);
      return res.status(500).json({ error: 'Status check failed' });
    }
  }
);

// ============================================================
// OTHER ENDPOINTS (Keep existing auth, products, etc.)
// ============================================================

// ... (Keep all your existing auth routes, products, operators, etc.)

// Static files
const DIST_PATH = path.join(process.cwd(), 'dist');
app.use(express.static(DIST_PATH));
app.get(/(.*)/, (_req, res) => res.sendFile(path.join(DIST_PATH, 'index.html')));

app.listen(Number(PORT), '0.0.0.0', () => 
  console.log(`🚀 API Server running on port ${PORT}`)
);
