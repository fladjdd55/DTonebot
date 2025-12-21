"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const payment_1 = require("../payment");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
// Simple admin check (expand with proper role system later)
const requireAdmin = async (req, res, next) => {
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim());
    if (!req.user || !adminEmails.includes(req.user.email)) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};
router.use(auth_1.requireAuth, requireAdmin);
// Dashboard Stats
router.get('/stats', async (_req, res) => {
    const [users, transactions, revenue] = await Promise.all([
        db_1.db.user.count(),
        db_1.db.transaction.count(),
        db_1.db.transaction.aggregate({
            where: { status: client_1.TransactionStatus.COMPLETED },
            _sum: { amount: true }
        })
    ]);
    res.json({
        totalUsers: users,
        totalTransactions: transactions,
        totalRevenue: revenue._sum.amount || 0
    });
});
// List Users
router.get('/users', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const search = req.query.search;
    const where = search ? { email: { contains: search } } : {};
    const [users, total] = await Promise.all([
        db_1.db.user.findMany({
            where,
            select: { id: true, email: true, name: true, createdAt: true, emailVerified: true },
            skip: (page - 1) * 20,
            take: 20,
            orderBy: { createdAt: 'desc' }
        }),
        db_1.db.user.count({ where })
    ]);
    res.json({ users, total, page });
});
// List Transactions
router.get('/transactions', async (req, res) => {
    const { status, userId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const where = {};
    if (status)
        where.status = status;
    if (userId)
        where.userId = userId;
    const transactions = await db_1.db.transaction.findMany({
        where,
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 20,
        take: 20
    });
    res.json({ transactions });
});
// Manual Refund
router.post('/transactions/:id/refund', async (req, res) => {
    const txn = await db_1.db.transaction.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!txn)
        return res.status(404).json({ error: 'Transaction not found' });
    const refund = await payment_1.paymentService.refundPayment(txn.paymentIntentId);
    if (!refund)
        return res.status(500).json({ error: 'Refund failed' });
    await db_1.db.transaction.update({
        where: { id: txn.id },
        data: { status: client_1.TransactionStatus.REFUNDED }
    });
    res.json({ message: 'Refunded successfully' });
});
exports.default = router;
