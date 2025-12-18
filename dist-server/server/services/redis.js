"use strict";
// server/services/redis.ts
// Handles webhook deduplication and caching
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
exports.getRedis = getRedis;
const ioredis_1 = require("ioredis");
class RedisService {
    client = null;
    fallbackCache = new Map();
    isRedisAvailable = false;
    constructor() {
        this.initialize();
    }
    initialize() {
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
            console.warn('[Redis] No REDIS_URL found. Using in-memory fallback.');
            this.setupFallbackCleanup();
            return;
        }
        try {
            this.client = new ioredis_1.Redis(redisUrl, {
                maxRetriesPerRequest: 3,
                retryStrategy: (times) => {
                    if (times > 3) {
                        console.error('[Redis] Max retries reached. Using fallback.');
                        return null;
                    }
                    return Math.min(times * 100, 2000);
                },
                reconnectOnError: (err) => {
                    console.error('[Redis] Connection error:', err.message);
                    return true;
                }
            });
            this.client.on('connect', () => {
                this.isRedisAvailable = true;
                console.log('[Redis] Connected successfully');
            });
            this.client.on('error', (err) => {
                this.isRedisAvailable = false;
                console.error('[Redis] Error:', err.message);
            });
        }
        catch (error) {
            console.error('[Redis] Initialization failed:', error.message);
            this.setupFallbackCleanup();
        }
    }
    /**
     * Cleanup expired entries from fallback cache every 5 minutes
     */
    setupFallbackCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [key, data] of this.fallbackCache.entries()) {
                if (data.expires < now) {
                    this.fallbackCache.delete(key);
                }
            }
        }, 5 * 60 * 1000);
    }
    /**
     * Get value from Redis or fallback cache
     */
    async get(key) {
        if (this.client && this.isRedisAvailable) {
            try {
                return await this.client.get(key);
            }
            catch (error) {
                console.error('[Redis] GET failed:', error.message);
            }
        }
        // Fallback to in-memory
        const cached = this.fallbackCache.get(key);
        if (cached && cached.expires > Date.now()) {
            return cached.value;
        }
        return null;
    }
    /**
     * Set value with support for:
     * 1. Standard TTL: set(key, value, ttlSeconds)
     * 2. Atomic Lock: set(key, value, 'EX', ttlSeconds, 'NX')
     */
    async set(key, value, arg3, arg4, arg5) {
        // Detect usage mode
        const isAtomicLock = typeof arg3 === 'string' && arg3 === 'EX' && arg5 === 'NX';
        const ttlSeconds = isAtomicLock ? arg4 : arg3;
        if (this.client && this.isRedisAvailable) {
            try {
                if (isAtomicLock && ttlSeconds) {
                    // 'NX' returns 'OK' if set, null if exists
                    return await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
                }
                if (ttlSeconds) {
                    await this.client.setex(key, ttlSeconds, value);
                    return 'OK';
                }
            }
            catch (error) {
                console.error('[Redis] SET failed:', error.message);
            }
        }
        // Fallback Logic (In-Memory)
        if (isAtomicLock) {
            // Check if key exists and hasn't expired
            const existing = this.fallbackCache.get(key);
            if (existing && existing.expires > Date.now()) {
                return null; // Failed to acquire lock (already exists)
            }
        }
        // Set value in fallback
        this.fallbackCache.set(key, {
            value,
            expires: Date.now() + ((ttlSeconds || 0) * 1000)
        });
        return 'OK';
    }
    /**
     * Delete key
     */
    async del(key) {
        if (this.client && this.isRedisAvailable) {
            try {
                await this.client.del(key);
                return;
            }
            catch (error) {
                console.error('[Redis] DEL failed:', error.message);
            }
        }
        this.fallbackCache.delete(key);
    }
    /**
     * Check if key exists
     */
    async exists(key) {
        const value = await this.get(key);
        return value !== null;
    }
    /**
     * Increment counter
     */
    async incr(key, ttlSeconds) {
        if (this.client && this.isRedisAvailable) {
            try {
                const value = await this.client.incr(key);
                if (ttlSeconds) {
                    await this.client.expire(key, ttlSeconds);
                }
                return value;
            }
            catch (error) {
                console.error('[Redis] INCR failed:', error.message);
            }
        }
        // Fallback
        const current = await this.get(key);
        const newValue = (parseInt(current || '0') + 1).toString();
        await this.set(key, newValue, ttlSeconds || 3600);
        return parseInt(newValue);
    }
    /**
     * Close connection gracefully
     */
    async close() {
        if (this.client) {
            await this.client.quit();
        }
        this.fallbackCache.clear();
    }
}
exports.RedisService = RedisService;
// Singleton instance
let redisInstance = null;
function getRedis() {
    if (!redisInstance) {
        redisInstance = new RedisService();
    }
    return redisInstance;
}
