"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthService = void 0;
const db_1 = require("../lib/db");
const redis_1 = require("../lib/redis");
const dtoneService_1 = require("./dtoneService");
const logger_1 = require("../lib/logger");
exports.healthService = {
    async check() {
        const checks = await Promise.allSettled([
            this.checkDatabase(),
            this.checkRedis(),
            this.checkDTOne(),
        ]);
        const [db, redis, dtone] = checks.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value;
            }
            const services = ['database', 'redis', 'dtone'];
            logger_1.logger.error({ service: services[index], err: result.reason }, 'Health check failed');
            return { status: 'disconnected', error: result.reason?.message };
        });
        const services = { database: db, redis, dtone };
        // Determine overall status
        const statuses = Object.values(services).map(s => s.status);
        let status = 'healthy';
        if (statuses.includes('disconnected')) {
            status = 'unhealthy';
        }
        else if (statuses.includes('degraded')) {
            status = 'degraded';
        }
        return {
            status,
            timestamp: new Date().toISOString(),
            services,
            version: process.env.npm_package_version || '1.0.0',
            uptime: process.uptime(),
        };
    },
    async checkDatabase() {
        const start = Date.now();
        try {
            await db_1.db.$queryRaw `SELECT 1`;
            return { status: 'connected', latency: Date.now() - start };
        }
        catch (error) {
            return { status: 'disconnected', error: error.message };
        }
    },
    async checkRedis() {
        const start = Date.now();
        try {
            await redis_1.redisClient.ping();
            return { status: 'connected', latency: Date.now() - start };
        }
        catch (error) {
            return { status: 'disconnected', error: error.message };
        }
    },
    async checkDTOne() {
        const start = Date.now();
        try {
            // Use a lightweight endpoint
            const result = await dtoneService_1.dtoneService.getCountries(1);
            const latency = Date.now() - start;
            if (result.success) {
                // Check if response is slow
                if (latency > 5000) {
                    return { status: 'degraded', latency, error: 'High latency' };
                }
                return { status: 'connected', latency };
            }
            return { status: 'degraded', latency, error: result.error };
        }
        catch (error) {
            return { status: 'disconnected', error: error.message };
        }
    },
};
// Health endpoint
router.get('/health', async (req, res) => {
    const health = await exports.healthService.check();
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
});
// Detailed health for internal monitoring
router.get('/health/detailed', authenticate, requireAdmin, async (req, res) => {
    const health = await exports.healthService.check();
    // Add more detailed metrics
    const detailed = {
        ...health,
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        connections: {
            database: await db_1.db.$queryRaw `SELECT count(*) FROM pg_stat_activity`,
        },
    };
    res.json(detailed);
});
