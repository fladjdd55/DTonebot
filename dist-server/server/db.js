"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
// server/db.ts
const client_1 = require("@prisma/client");
exports.db = new client_1.PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    // ✅ ADD: Connection pool optimization
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
});
// ✅ ADD: Graceful disconnect on process exit
if (process.env.NODE_ENV !== 'production') {
    process.on('beforeExit', async () => {
        await exports.db.$disconnect();
    });
}
