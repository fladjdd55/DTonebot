export declare class RedisService {
    private client;
    private fallbackCache;
    private isRedisAvailable;
    private initializationPromise;
    constructor();
    /**
     * Ensures Redis is connected before performing operations
     */
    private ensureConnection;
    private initialize;
    private setupFallbackCleanup;
    /**
     * ✅ NEW: Required for Health Check in server/index.ts
     */
    ping(): Promise<string>;
    /**
     * ✅ NEW: Missing method required by auth.ts
     */
    expire(key: string, ttlSeconds: number): Promise<boolean>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, arg3: number | string, arg4?: number, arg5?: string): Promise<string | null>;
    del(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    incr(key: string, ttlSeconds?: number): Promise<number>;
    close(): Promise<void>;
}
export declare function getRedis(): RedisService;
