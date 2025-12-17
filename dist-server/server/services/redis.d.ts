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
     * Set value with TTL (seconds)
     */
    set(key: string, value: string, ttlSeconds: number): Promise<void>;
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
