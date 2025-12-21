"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWebhookCleanupJob = startWebhookCleanupJob;
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = require("../lib/db");
const logger_1 = require("../lib/logger");
const RETENTION_DAYS = 30;
function startWebhookCleanupJob() {
    // Run daily at 3 AM
    node_cron_1.default.schedule('0 3 * * *', async () => {
        logger_1.logger.info('Starting webhook events cleanup');
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
            // Delete old processed events
            const deleted = await db_1.db.webhookEvent.deleteMany({
                where: {
                    processedAt: { not: null },
                    createdAt: { lt: cutoffDate },
                },
            });
            logger_1.logger.info(`Cleaned up ${deleted.count} old webhook events`);
            // Also clean up old transactions that are stuck in PENDING
            const stuckTx = await db_1.db.transaction.updateMany({
                where: {
                    status: 'PENDING',
                    createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Older than 24h
                },
                data: {
                    status: 'ABANDONED',
                },
            });
            if (stuckTx.count > 0) {
                logger_1.logger.warn(`Marked ${stuckTx.count} stuck transactions as ABANDONED`);
            }
            // Vacuum webhook_events table (PostgreSQL)
            await db_1.db.$executeRaw `VACUUM ANALYZE webhook_events`;
        }
        catch (error) {
            logger_1.logger.error('Webhook cleanup failed:', error);
        }
    });
    logger_1.logger.info('Webhook cleanup job scheduled');
}
