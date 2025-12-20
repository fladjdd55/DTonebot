import { PrismaClient } from '@prisma/client';

export const db = new PrismaClient({
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
    await db.$disconnect();
  });
}
