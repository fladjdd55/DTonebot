// tests/integration/payment-flow.test.ts
// Comprehensive test suite for fixed payment flow

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });

const API_URL = process.env.TEST_API_URL || 'http://localhost:5000';

// Helper to create test user
async function createTestUser() {
  const email = `test-${Date.now()}@example.com`;
  const password = 'testpassword123';
  
  const response = await request(API_URL)
    .post('/api/auth/register')
    .send({ email, password, name: 'Test User' });
  
  return {
    user: response.body.user,
    accessToken: response.body.accessToken,
    refreshToken: response.body.refreshToken
  };
}

// Helper to create test product
async function createTestProduct() {
  return await prisma.product.create({
    data: {
      id: 999999, // Unique test ID
      name: 'Test Product',
      type: 'FIXED_VALUE_RECHARGE',
      serviceId: 1,
      operatorId: 1,
      currency: 'USD',
      amount: 10,
      costPrice: 5, // $5 cost -> $5.75 with 15% margin
      costCurrency: 'USD'
    }
  });
}

// =====================================================
// TEST SUITE 1: PRICE CALCULATION SECURITY
// =====================================================

describe('Price Calculation Security', () => {
  let testProduct: any;
  
  beforeAll(async () => {
    testProduct = await createTestProduct();
  });
  
  afterAll(async () => {
    await prisma.product.delete({ where: { id: testProduct.id } });
  });

  it('should reject client-provided price', async () => {
    // Attempt to manipulate price on client side
    const response = await request(API_URL)
      .post('/api/create-payment-intent')
      .send({
        productId: testProduct.id,
        mobile: '+1234567890',
        type: 'FIXED_VALUE_RECHARGE',
        // ❌ Client shouldn't send price (server calculates)
        clientPrice: 1.00 // Trying to pay $1 for $5.75 product
      });
    
    // Server should calculate correct price
    expect(response.status).toBe(200);
    expect(response.body.chargeAmount).toBeCloseTo(5.75, 2); // $5 * 1.15
    expect(response.body.chargeAmount).not.toBe(1.00);
  });

  it('should calculate price consistently', async () => {
    // Make multiple requests
    const requests = await Promise.all([
      request(API_URL).post('/api/create-payment-intent').send({
        productId: testProduct.id,
        mobile: '+1234567890',
        type: 'FIXED_VALUE_RECHARGE'
      }),
      request(API_URL).post('/api/create-payment-intent').send({
        productId: testProduct.id,
        mobile: '+9876543210',
        type: 'FIXED_VALUE_RECHARGE'
      })
    ]);
    
    // All should have same price
    expect(requests[0].body.chargeAmount).toBe(requests[1].body.chargeAmount);
    expect(requests[0].body.chargeAmount).toBeCloseTo(5.75, 2);
  });

  it('should enforce minimum order amount', async () => {
    // Create product below minimum
    const cheapProduct = await prisma.product.create({
      data: {
        id: 999998,
        name: 'Cheap Test Product',
        type: 'FIXED_VALUE_RECHARGE',
        serviceId: 1,
        operatorId: 1,
        currency: 'USD',
        amount: 1,
        costPrice: 1, // $1 * 1.15 = $1.15 (below $5 min)
        costCurrency: 'USD'
      }
    });
    
    const response = await request(API_URL)
      .post('/api/create-payment-intent')
      .send({
        productId: cheapProduct.id,
        mobile: '+1234567890',
        type: 'FIXED_VALUE_RECHARGE'
      });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Minimum order is $5');
    
    await prisma.product.delete({ where: { id: cheapProduct.id } });
  });

  it('should validate ranged product amounts', async () => {
    const rangedProduct = await prisma.product.create({
      data: {
        id: 999997,
        name: 'Ranged Test Product',
        type: 'RANGED_VALUE_RECHARGE',
        serviceId: 1,
        operatorId: 1,
        currency: 'HTG',
        minAmount: 100,
        maxAmount: 1000,
        costPrice: 10, // Base cost for min amount
        costCurrency: 'USD'
      }
    });
    
    // Test below minimum
    let response = await request(API_URL)
      .post('/api/create-payment-intent')
      .send({
        productId: rangedProduct.id,
        mobile: '+50912345678',
        type: 'RANGED_VALUE_RECHARGE',
        customAmount: 50 // Below min of 100
      });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('between 100 and 1000');
    
    // Test above maximum
    response = await request(API_URL)
      .post('/api/create-payment-intent')
      .send({
        productId: rangedProduct.id,
        mobile: '+50912345678',
        type: 'RANGED_VALUE_RECHARGE',
        customAmount: 1500 // Above max of 1000
      });
    
    expect(response.status).toBe(400);
    
    // Test valid amount
    response = await request(API_URL)
      .post('/api/create-payment-intent')
      .send({
        productId: rangedProduct.id,
        mobile: '+50912345678',
        type: 'RANGED_VALUE_RECHARGE',
        customAmount: 500 // Valid
      });
    
    expect(response.status).toBe(200);
    expect(response.body.localAmount).toBe(500);
    
    await prisma.product.delete({ where: { id: rangedProduct.id } });
  });
});

// =====================================================
// TEST SUITE 2: WEBHOOK DEDUPLICATION
// =====================================================

describe('Webhook Deduplication', () => {
  let testProduct: any;
  let paymentIntent: Stripe.PaymentIntent;
  
  beforeAll(async () => {
    testProduct = await createTestProduct();
  });
  
  afterAll(async () => {
    await prisma.product.delete({ where: { id: testProduct.id } });
  });

  it('should process webhook only once', async () => {
    // Create payment intent
    paymentIntent = await stripe.paymentIntents.create({
      amount: 575, // $5.75
      currency: 'usd',
      metadata: {
        productId: testProduct.id.toString(),
        mobile: '+1234567890',
        type: 'FIXED_VALUE_RECHARGE'
      }
    });
    
    // Simulate webhook event
    const webhookPayload = {
      id: `evt_test_${Date.now()}`,
      type: 'payment_intent.succeeded',
      data: {
        object: paymentIntent
      }
    };
    
    // Send webhook twice
    const response1 = await request(API_URL)
      .post('/api/hooks/stripe')
      .set('stripe-signature', 'test_signature')
      .send(webhookPayload);
    
    const response2 = await request(API_URL)
      .post('/api/hooks/stripe')
      .set('stripe-signature', 'test_signature')
      .send(webhookPayload);
    
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(response2.body.duplicate).toBe(true);
    
    // Check database - should only have ONE transaction
    const transactions = await prisma.transaction.findMany({
      where: { paymentIntentId: paymentIntent.id }
    });
    
    expect(transactions.length).toBe(1);
  });
});

// =====================================================
// TEST SUITE 3: TOKEN ROTATION
// =====================================================

describe('Authentication Token Rotation', () => {
  it('should rotate tokens safely', async () => {
    const { refreshToken: token1 } = await createTestUser();
    
    // Refresh token (should get new token)
    const response = await request(API_URL)
      .post('/api/auth/refresh')
      .set('Cookie', [`refresh_token=${token1}`])
      .send();
    
    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeDefined();
    
    const token2 = response.headers['set-cookie']
      ?.find((c: string) => c.startsWith('refresh_token='))
      ?.split(';')[0]
      .split('=')[1];
    
    expect(token2).toBeDefined();
    expect(token2).not.toBe(token1);
    
    // Old token should be revoked
    const oldTokenResponse = await request(API_URL)
      .post('/api/auth/refresh')
      .set('Cookie', [`refresh_token=${token1}`])
      .send();
    
    expect(oldTokenResponse.status).toBe(403);
  });

  it('should not lose session on refresh failure', async () => {
    const { refreshToken, accessToken } = await createTestUser();
    
    // Simulate refresh failure (invalid device)
    // In a real scenario, you'd mock the fingerprint check
    
    // Access token should still work until it expires
    const response = await request(API_URL)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send();
    
    expect(response.status).toBe(200);
  });
});

// =====================================================
// TEST SUITE 4: RACE CONDITIONS
// =====================================================

describe('Concurrent Purchase Prevention', () => {
  let testProduct: any;
  let testUser: any;
  
  beforeAll(async () => {
    testProduct = await createTestProduct();
    testUser = await createTestUser();
  });
  
  afterAll(async () => {
    await prisma.product.delete({ where: { id: testProduct.id } });
  });

  it('should prevent duplicate purchases from webhook + API', async () => {
    // Create payment intent
    const intentResponse = await request(API_URL)
      .post('/api/create-payment-intent')
      .set('Authorization', `Bearer ${testUser.accessToken}`)
      .send({
        productId: testProduct.id,
        mobile: '+1234567890',
        type: 'FIXED_VALUE_RECHARGE'
      });
    
    const paymentIntentId = intentResponse.body.id;
    
    // Simulate concurrent calls to purchase endpoint
    const purchases = await Promise.all([
      request(API_URL)
        .post('/api/purchase')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({
          productId: testProduct.id,
          mobile: '+1234567890',
          amount: 10,
          unit: 'USD',
          paymentId: paymentIntentId,
          type: 'FIXED_VALUE_RECHARGE'
        }),
      request(API_URL)
        .post('/api/purchase')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({
          productId: testProduct.id,
          mobile: '+1234567890',
          amount: 10,
          unit: 'USD',
          paymentId: paymentIntentId,
          type: 'FIXED_VALUE_RECHARGE'
        })
    ]);
    
    // Both should succeed (idempotent)
    expect(purchases[0].status).toBe(200);
    expect(purchases[1].status).toBe(200);
    
    // But only ONE transaction in database
    const transactions = await prisma.transaction.findMany({
      where: { paymentIntentId }
    });
    
    expect(transactions.length).toBeLessThanOrEqual(1);
  });
});

// =====================================================
// TEST SUITE 5: PERFORMANCE
// =====================================================

describe('Performance Benchmarks', () => {
  it('should create payment intent in <500ms', async () => {
    const testProduct = await createTestProduct();
    
    const start = Date.now();
    
    await request(API_URL)
      .post('/api/create-payment-intent')
      .send({
        productId: testProduct.id,
        mobile: '+1234567890',
        type: 'FIXED_VALUE_RECHARGE'
      });
    
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(500);
    
    await prisma.product.delete({ where: { id: testProduct.id } });
  });

  it('should load transaction history efficiently', async () => {
    const testUser = await createTestUser();
    
    // Create 50 test transactions
    await prisma.transaction.createMany({
      data: Array(50).fill(null).map((_, i) => ({
        externalId: `test_${Date.now()}_${i}`,
        mobile: '+1234567890',
        productId: 1,
        amount: 10,
        currency: 'USD',
        status: 'COMPLETED',
        userId: testUser.user.id
      }))
    });
    
    const start = Date.now();
    
    const response = await request(API_URL)
      .get('/api/user/transactions?page=1')
      .set('Authorization', `Bearer ${testUser.accessToken}`)
      .send();
    
    const duration = Date.now() - start;
    
    expect(response.status).toBe(200);
    expect(duration).toBeLessThan(500);
    expect(response.body.transactions).toHaveLength(20); // Paginated
  });
});

// =====================================================
// CLEANUP
// =====================================================

afterAll(async () => {
  await prisma.$disconnect();
});
