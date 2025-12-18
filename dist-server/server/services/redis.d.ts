export declare class RedisService {
    private client;
    private fallbackCache;
    private isRedisAvailable;
    constructor();
    private initialize;
    /**
     * Cleanup expired entries from fallback cache every 5 minutes
     */
    private setupFallbackCleanup;
    /**
     * Get value from Redis or fallback cache
     */
    get(key: string): Promise<string | null>;
    /**
     * Set value with support for:
     * 1. Standard TTL: set(key, value, ttlSeconds)
     * 2. Atomic Lock: set(key, value, 'EX', ttlSeconds, 'NX')
     */
    set(key: string, value: string, arg3: number | string, arg4?: number, arg5?: string): Promise<string | null>;
    /**
     * Delete key
     */
    del(key: string): Promise<void>;
    /**
     * Check if key exists
     */
    exists(key: string): Promise<boolean>;
    /**
     * Increment counter
     */
    incr(key: string, ttlSeconds?: number): Promise<number>;
    /**
     * Close connection gracefully
     */
    close(): Promise<void>;
}
export declare function getRedis(): RedisService;
