import { PrismaClient } from '@prisma/client';
export declare const db: PrismaClient<{
    log: ("error" | "query" | "warn")[];
    datasources: {
        db: {
            url: string | undefined;
        };
    };
}, never, import("@prisma/client/runtime/library").DefaultArgs>;
