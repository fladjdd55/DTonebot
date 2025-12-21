import { PrismaClient } from '@prisma/client';
export declare const db: PrismaClient<{
    log: ("error" | "warn" | "query")[];
    datasources: {
        db: {
            url: string | undefined;
        };
    };
}, never, import("@prisma/client/runtime/library").DefaultArgs>;
