"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const client_1 = require("@prisma/client");
exports.db = new client_1.PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
    // ❌ REMOVED: connectionLimit (This belongs in DATABASE_URL)
});
// Graceful disconnect on process exit (Best Practice)
if (process.env.NODE_ENV !== 'production') {
    process.on('beforeExit', async () => {
        await exports.db.$disconnect();
    });
}
