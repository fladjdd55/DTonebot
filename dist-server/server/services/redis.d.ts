export declare class RedisService {
    private client;
    private fallbackCache;
    private isRedisAvailable;
    private initializationPromise;
    private readonly MAX_CACHE_SIZE;
    constructor();
    private ensureConnection;
    private initialize;
    private setupFallbackCleanup;
    expire(key: string, ttlSeconds: number): Promise<boolean>;
    get(key: string): Promise<string | null>;
    /**
     * Fixed set method to handle all overloaded signatures correctly.
     */
    set(key: string, value: string, arg3?: number | string, arg4?: number, arg5?: string): Promise<string | null>;
    del(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    ping(): Promise<string>;
    incr(key: string, ttlSeconds?: number): Promise<number>;
    close(): Promise<void>;
}
export declare function getRedis(): RedisService;
