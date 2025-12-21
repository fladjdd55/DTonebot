"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const redis_1 = require("../services/redis");
const db_1 = require("../db");
const dtone_1 = require("../dtone");
const transactionService_1 = require("../services/transactionService");
const sync_countries_1 = require("../scripts/sync-countries");
const sync_operators_1 = require("../scripts/sync-operators");
const router = (0, express_1.Router)();
const redis = (0, redis_1.getRedis)();
const CACHE_TTL = 3600;
// ✅ SECURITY: Limit Lookup Requests
// 10 requests per minute per IP address
const lookupLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: { error: "Too many lookup requests. Please wait a minute." },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
async function getCachedCountries() {
    const cached = await redis.get('cache:countries');
    if (cached)
        return JSON.parse(cached);
    const fresh = await (0, sync_countries_1.syncCountries)();
    if (fresh)
        await redis.set('cache:countries', JSON.stringify(fresh), CACHE_TTL);
    return fresh || [];
}
async function getCachedOperators() {
    const cached = await redis.get('cache:operators');
    if (cached)
        return JSON.parse(cached);
    const fresh = await (0, sync_operators_1.syncOperators)();
    if (fresh) {
        await redis.set('cache:operators', JSON.stringify(fresh), CACHE_TTL);
        const index = {};
        for (const op of fresh) {
            const code = (op.countryCode || op.countryIso)?.toUpperCase();
            if (code) {
                if (!index[code])
                    index[code] = [];
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
router.get('/products', async (req, res) => {
    const { operatorId, currency } = req.query;
    if (!operatorId)
        return res.status(400).json({ error: 'Operator ID required' });
    const whereClause = { operatorId: Number(operatorId) };
    if (currency)
        whereClause.currency = String(currency).toUpperCase();
    // 1. Fetch from DB
    const localProducts = await db_1.db.product.findMany({
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
            const adjustedMin = transactionService_1.transactionService.getSafeMinAmount(p);
            const { costPrice, costPriceMin, ...rest } = p; // Strip sensitive data
            return { ...rest, minAmount: adjustedMin };
        });
        return res.json(safeProducts);
    }
    // 2. Fallback: Fetch from API
    const result = await dtone_1.dtoneService.getProductsForOperator(Number(operatorId));
    if (result.success && result.data) {
        const safeProducts = result.data.map(p => {
            const adjustedMin = transactionService_1.transactionService.getSafeMinAmount(p);
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
            };
        });
        return res.json(safeProducts);
    }
    return res.status(400).json({ error: result.error });
});
router.post('/lookup', lookupLimiter, async (req, res) => {
    const { mobile } = req.body;
    if (!mobile)
        return res.status(400).json({ error: 'Mobile required' });
    const result = await dtone_1.dtoneService.lookupMobileNumber(mobile);
    return result.success ? res.json(result.data) : res.status(404).json({ error: result.error });
});
exports.default = router;
