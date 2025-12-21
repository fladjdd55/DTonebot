import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { db } from '../db';
import { paymentService } from '../payment';
import { TransactionStatus } from '@prisma/client';

const router = Router();

// Simple admin check (expand with proper role system later)
const requireAdmin = async (req: Request, res: Response, next: Function) => {
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim());
  if (!req.user || !adminEmails.includes(req.user.email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

router.use(requireAuth, requireAdmin);

// Dashboard Stats
router.get('/stats', async (_req, res) => {
  const [users, transactions, revenue] = await Promise.all([
    db.user.count(),
    db.transaction.count(),
    db.transaction.aggregate({
      where: { status: TransactionStatus.COMPLETED },
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
  const page = parseInt(req.query.page as string) || 1;
  const search = req.query.search as string;
  
  const where = search ? { email: { contains: search } } : {};
  
  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      select: { id: true, email: true, name: true, createdAt: true, emailVerified: true },
      skip: (page - 1) * 20,
      take: 20,
      orderBy: { createdAt: 'desc' }
    }),
    db.user.count({ where })
  ]);
  
  res.json({ users, total, page });
});

// List Transactions
router.get('/transactions', async (req, res) => {
  const { status, userId } = req.query;
  const page = parseInt(req.query.page as string) || 1;
  
  const where: any = {};
  if (status) where.status = status;
  if (userId) where.userId = userId;
  
  const transactions = await db.transaction.findMany({
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
  const txn = await db.transaction.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });
  
  const refund = await paymentService.refundPayment(txn.paymentIntentId);
  if (!refund) return res.status(500).json({ error: 'Refund failed' });
  
  await db.transaction.update({
    where: { id: txn.id },
    data: { status: TransactionStatus.REFUNDED }
  });
  
  res.json({ message: 'Refunded successfully' });
});

export default router;
