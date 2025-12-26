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
    initializationPromise = null;
    constructor() {
        // Lazy load on first usage
    }
    async ensureConnection() {
        if (this.client || this.isRedisAvailable)
            return;
        if (!this.initializationPromise) {
            this.initializationPromise = this.initialize();
        }
        await this.initializationPromise;
    }
    async initialize() {
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
            console.warn('[Redis] ⚠️ No REDIS_URL found in .env. Using in-memory fallback.');
            this.setupFallbackCleanup();
            return;
        }
        try {
            console.log('[Redis] 🔌 Connecting to Redis Cloud...');
            this.client = new ioredis_1.Redis(redisUrl, {
                maxRetriesPerRequest: 3,
                retryStrategy: (times) => {
                    if (times > 3) {
                        console.error('[Redis] ❌ Max retries reached. Switching to fallback.');
                        return null;
                    }
                    return Math.min(times * 100, 2000);
                },
                reconnectOnError: (err) => {
                    // Only reconnect on specific errors to avoid loops
                    if (err.message.includes('READONLY'))
                        return true;
                    return false;
                }
            });
            this.client.on('connect', () => {
                this.isRedisAvailable = true;
                console.log('[Redis] ✅ Connected successfully');
            });
            this.client.on('error', (err) => {
                this.isRedisAvailable = false;
                console.error('[Redis] ❌ Error:', err.message);
            });
            await new Promise((resolve) => {
                this.client?.once('connect', () => resolve());
                setTimeout(resolve, 2000);
            });
        }
        catch (error) {
            console.error('[Redis] ❌ Initialization failed:', error.message);
            this.setupFallbackCleanup();
        }
    }
    setupFallbackCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [key, data] of this.fallbackCache.entries()) {
                if (data.expires < now)
                    this.fallbackCache.delete(key);
            }
        }, 5 * 60 * 1000);
    }
    // ==================================================================
    // PUBLIC METHODS
    // ==================================================================
    async expire(key, ttlSeconds) {
        await this.ensureConnection();
        const ttl = Math.ceil(ttlSeconds); // ✅ Safety: Ensure Integer
        if (this.client && this.isRedisAvailable) {
            try {
                const result = await this.client.expire(key, ttl);
                return result === 1;
            }
            catch (error) {
                console.error('[Redis] EXPIRE failed:', error.message);
            }
        }
        const cached = this.fallbackCache.get(key);
        if (cached) {
            cached.expires = Date.now() + (ttl * 1000);
            return true;
        }
        return false;
    }
    async get(key) {
        await this.ensureConnection();
        if (this.client && this.isRedisAvailable) {
            try {
                return await this.client.get(key);
            }
            catch (error) {
                console.error('[Redis] GET failed:', error.message);
            }
        }
        const cached = this.fallbackCache.get(key);
        if (cached && cached.expires > Date.now()) {
            return cached.value;
        }
        return null;
    }
    /**
     * Fixed set method to handle all overloaded signatures correctly.
     */
    async set(key, value, arg3, arg4, arg5) {
        await this.ensureConnection();
        // Normalize Arguments
        let ttl;
        let isAtomic = false; // For NX
        let isStandardEx = false; // For EX without NX
        // Case 1: set(key, val, ttl) -> setex
        if (typeof arg3 === 'number') {
            ttl = arg3;
        }
        // Case 2: set(key, val, 'EX', ttl) OR set(key, val, 'EX', ttl, 'NX')
        else if (typeof arg3 === 'string' && arg3 === 'EX' && typeof arg4 === 'number') {
            ttl = arg4;
            if (arg5 === 'NX')
                isAtomic = true;
            else
                isStandardEx = true;
        }
        // ✅ Safety: Redis requires integer TTLs
        if (ttl !== undefined)
            ttl = Math.ceil(ttl);
        if (this.client && this.isRedisAvailable) {
            try {
                if (isAtomic && ttl !== undefined) {
                    // Lock: set(key, val, 'EX', ttl, 'NX')
                    return await this.client.set(key, value, 'EX', ttl, 'NX');
                }
                else if (isStandardEx && ttl !== undefined) {
                    // Idempotency: set(key, val, 'EX', ttl)
                    return await this.client.set(key, value, 'EX', ttl);
                }
                else if (ttl !== undefined) {
                    // Cache: set(key, val, ttl) -> setex
                    await this.client.setex(key, ttl, value);
                    return 'OK';
                }
                else {
                    // Permanent: set(key, val)
                    return await this.client.set(key, value);
                }
            }
            catch (error) {
                console.error('[Redis] SET failed:', error.message);
            }
        }
        // Fallback Implementation
        if (isAtomic) {
            const existing = this.fallbackCache.get(key);
            if (existing && existing.expires > Date.now())
                return null;
        }
        this.fallbackCache.set(key, {
            value,
            expires: ttl ? Date.now() + (ttl * 1000) : Infinity
        });
        return 'OK';
    }
    async del(key) {
        await this.ensureConnection();
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
    async exists(key) {
        // Optimized: Use GET so fallback logic is consistent
        const value = await this.get(key);
        return value !== null;
    }
    async ping() {
        await this.ensureConnection();
        if (this.client && this.isRedisAvailable) {
            return await this.client.ping();
        }
        return 'PONG';
    }
    // ✅ FIXED: Synchronous update for memory fallback to prevent race conditions
    async incr(key, ttlSeconds) {
        await this.ensureConnection();
        const ttl = ttlSeconds ? Math.ceil(ttlSeconds) : undefined;
        if (this.client && this.isRedisAvailable) {
            try {
                const value = await this.client.incr(key);
                if (ttl)
                    await this.client.expire(key, ttl);
                return value;
            }
            catch (error) {
                console.error('[Redis] INCR failed:', error.message);
            }
        }
        // Memory Fallback: Atomic read-modify-write (because JS is single threaded)
        const currentData = this.fallbackCache.get(key);
        let currentValue = 0;
        // Check if expired
        if (currentData && currentData.expires > Date.now()) {
            currentValue = parseInt(currentData.value || '0');
        }
        const newValue = currentValue + 1;
        this.fallbackCache.set(key, {
            value: newValue.toString(),
            expires: ttl ? Date.now() + (ttl * 1000) : (currentData?.expires || Infinity)
        });
        return newValue;
    }
    async close() {
        if (this.client) {
            await this.client.quit();
        }
        this.fallbackCache.clear();
    }
}
exports.RedisService = RedisService;
let redisInstance = null;
function getRedis() {
    if (!redisInstance) {
        redisInstance = new RedisService();
    }
    return redisInstance;
}
