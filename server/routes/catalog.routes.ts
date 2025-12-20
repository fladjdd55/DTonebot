import { Router, Request, Response } from 'express';
import { getRedis } from '../services/redis';
import { db } from '../db';
import { dtoneService } from '../dtone';
import { transactionService } from '../services/transactionService';
import { syncCountries } from '../scripts/sync-countries';
import { syncOperators } from '../scripts/sync-operators';

const router = Router();
const redis = getRedis();
const CACHE_TTL = 3600;

async function getCachedCountries() {
  const cached = await redis.get('cache:countries');
  if (cached) return JSON.parse(cached);
  
  const fresh = await syncCountries();
  if (fresh) await redis.set('cache:countries', JSON.stringify(fresh), CACHE_TTL);
  return fresh || [];
}

async function getCachedOperators() {
  const cached = await redis.get('cache:operators');
  if (cached) return JSON.parse(cached);
  
  const fresh = await syncOperators();
  if (fresh) {
    await redis.set('cache:operators', JSON.stringify(fresh), CACHE_TTL);
    const index: Record<string, any[]> = {};
    for (const op of fresh) {
      const code = (op.countryCode || op.countryIso)?.toUpperCase();
      if (code) {
        if (!index[code]) index[code] = [];
        index[code].push(op);
      }
    }
    await redis.set('cache:operator_index', JSON.stringify(index), CACHE_TTL);
  }
  return fresh || [];
}

router.get('/countries', async (_req, res) => res.json(await getCachedCountries()));

router.get('/operators', async (req, res) => {
  const { country } = req.query;
  if (country) {
    const code = String(country).toUpperCase();
    const indexStr = await redis.get('cache:operator_index');
    if (indexStr) {
      const index = JSON.parse(indexStr);
      return res.json(index[code] || []);
    }
  }
  return res.json(await getCachedOperators());
});

router.get('/products', async (req: Request, res: Response): Promise<any> => {
  const { operatorId, currency } = req.query;
  if (!operatorId) return res.status(400).json({ error: 'Operator ID required' });

  const whereClause: any = { operatorId: Number(operatorId) };
  if (currency) whereClause.currency = String(currency).toUpperCase();

  // 1. Fetch from DB
  const localProducts = await db.product.findMany({
    where: whereClause,
    orderBy: { amount: 'asc' },
    select: {
      id: true,
      name: true,
      type: true,
      serviceId: true,
      subserviceId: true,
      amount: true,
      currency: true,
      minAmount: true,
      maxAmount: true,
      benefits: true,
      costPrice: true,
      costPriceMin: true
    }
  });

  if (localProducts.length > 0) {
    const safeProducts = localProducts.map(p => {
      const adjustedMin = transactionService.getSafeMinAmount(p);
      const { costPrice, costPriceMin, ...rest } = p; // Strip sensitive data
      return { ...rest, minAmount: adjustedMin };
    });
    return res.json(safeProducts);
  }

  // 2. Fallback: Fetch from API
  const result = await dtoneService.getProductsForOperator(Number(operatorId));

  if (result.success && result.data) {
    const safeProducts = result.data.map(p => {
      const adjustedMin = transactionService.getSafeMinAmount(p);
      return {
       id: p.id,
       name: p.name,
       type: p.type,
       amount: p.amount,
       currency: p.currency,
       minAmount: adjustedMin,
       maxAmount: p.max,
       benefits: p.benefits,
       isRanged: p.isRanged
    }});
    return res.json(safeProducts);
  }

  return res.status(400).json({ error: result.error });
});

router.post('/lookup', async (req, res) => {
  const { mobile } = req.body;
  if (!mobile) return res.status(400).json({ error: 'Mobile required' });
  const result = await dtoneService.lookupMobileNumber(mobile);
  return result.success ? res.json(result.data) : res.status(404).json({ error: result.error });
});

export default router;
