"use strict";
// src/routes/admin.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../lib/db");
const router = (0, express_1.Router)();
// All admin routes require authentication and admin role
router.use(auth_1.authenticate, auth_1.requireAdmin);
// List users with pagination
router.get('/users', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const search = req.query.search;
    const where = search
        ? { email: { contains: search, mode: 'insensitive' } }
        : {};
    const [users, total] = await Promise.all([
        db_1.db.user.findMany({
            where,
            select: {
                id: true,
                email: true,
                emailVerified: true,
                twoFactorEnabled: true,
                createdAt: true,
                _count: { select: { transactions: true } },
            },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        db_1.db.user.count({ where }),
    ]);
    res.json({
        users,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
        },
    });
});
// Get user details
router.get('/users/:id', async (req, res) => {
    const user = await db_1.db.user.findUnique({
        where: { id: parseInt(req.params.id) },
        select: {
            id: true,
            email: true,
            emailVerified: true,
            twoFactorEnabled: true,
            createdAt: true,
            transactions: {
                take: 10,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    status: true,
                    amount: true,
                    createdAt: true,
                },
            },
        },
    });
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
});
// List transactions with filters
router.get('/transactions', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const status = req.query.status;
    const userId = req.query.userId ? parseInt(req.query.userId) : undefined;
    const where = {};
    if (status)
        where.status = status;
    if (userId)
        where.userId = userId;
    const [transactions, total] = await Promise.all([
        db_1.db.transaction.findMany({
            where,
            include: {
                user: { select: { email: true } },
            },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        db_1.db.transaction.count({ where }),
    ]);
    res.json({
        transactions,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
});
// Get transaction details
router.get('/transactions/:id', async (req, res) => {
    const transaction = await db_1.db.transaction.findUnique({
        where: { id: parseInt(req.params.id) },
        include: {
            user: { select: { id: true, email: true } },
        },
    });
    if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json(transaction);
});
// Manually retry a failed transaction
router.post('/transactions/:id/retry', async (req, res) => {
    const transaction = await db_1.db.transaction.findUnique({
        where: { id: parseInt(req.params.id) },
    });
    if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
    }
    if (!['FAILED', 'REFUND_FAILED'].includes(transaction.status)) {
        return res.status(400).json({ error: 'Transaction cannot be retried' });
    }
    // Queue for retry
    await transactionQueue.add('retry', { transactionId: transaction.id });
    res.json({ message: 'Transaction queued for retry' });
});
// Issue manual refund
router.post('/transactions/:id/refund', async (req, res) => {
    const { reason } = req.body;
    const transaction = await db_1.db.transaction.findUnique({
        where: { id: parseInt(req.params.id) },
    });
    if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
    }
    if (transaction.status !== 'FAILED') {
        return res.status(400).json({ error: 'Only failed transactions can be refunded' });
    }
    // Process refund via Stripe
    const refund = await stripe.refunds.create({
        payment_intent: transaction.paymentId,
        reason: 'requested_by_customer',
        metadata: {
            adminId: req.user.id.toString(),
            reason: reason || 'Admin-initiated refund',
        },
    });
    await db_1.db.transaction.update({
        where: { id: transaction.id },
        data: {
            status: 'REFUNDED',
            refundId: refund.id,
            refundedAt: new Date(),
            adminNote: reason,
        },
    });
    res.json({ message: 'Refund processed', refundId: refund.id });
});
// Dashboard stats
router.get('/stats', async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [totalUsers, verifiedUsers, totalTransactions, todayTransactions, revenueToday, statusBreakdown,] = await Promise.all([
        db_1.db.user.count(),
        db_1.db.user.count({ where: { emailVerified: true } }),
        db_1.db.transaction.count(),
        db_1.db.transaction.count({ where: { createdAt: { gte: today } } }),
        db_1.db.transaction.aggregate({
            where: { createdAt: { gte: today }, status: 'COMPLETED' },
            _sum: { amount: true },
        }),
        db_1.db.transaction.groupBy({
            by: ['status'],
            _count: true,
        }),
    ]);
    res.json({
        users: { total: totalUsers, verified: verifiedUsers },
        transactions: {
            total: totalTransactions,
            today: todayTransactions,
            revenueToday: revenueToday._sum.amount || 0,
            byStatus: Object.fromEntries(statusBreakdown.map(s => [s.status, s._count])),
        },
    });
});
exports.default = router;
