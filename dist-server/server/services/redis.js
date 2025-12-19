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
        // Removed automatic initialize() to allow lazy loading
    }
    /**
     * Ensures Redis is connected before performing operations
     */
    async ensureConnection() {
        if (this.client || this.isRedisAvailable)
            return;
        // Prevent multiple simultaneous connection attempts
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
                    console.error('[Redis] ⚠️ Connection error:', err.message);
                    return true;
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
            // Wait for the connection to be ready (optional, but good for first hit)
            await new Promise((resolve) => {
                this.client?.once('connect', () => resolve());
                // Don't block forever if it fails
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
                if (data.expires < now) {
                    this.fallbackCache.delete(key);
                }
            }
        }, 5 * 60 * 1000);
    }
    // ==================================================================
    // PUBLIC METHODS
    // ==================================================================
    /**
     * ✅ NEW: Missing method required by auth.ts
     */
    async expire(key, ttlSeconds) {
        await this.ensureConnection();
        if (this.client && this.isRedisAvailable) {
            try {
                const result = await this.client.expire(key, ttlSeconds);
                return result === 1;
            }
            catch (error) {
                console.error('[Redis] EXPIRE failed:', error.message);
            }
        }
        // Fallback logic
        const cached = this.fallbackCache.get(key);
        if (cached) {
            cached.expires = Date.now() + (ttlSeconds * 1000);
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
    async set(key, value, arg3, arg4, arg5) {
        await this.ensureConnection();
        const isAtomicLock = typeof arg3 === 'string' && arg3 === 'EX' && arg5 === 'NX';
        const ttlSeconds = isAtomicLock ? arg4 : arg3;
        if (this.client && this.isRedisAvailable) {
            try {
                if (isAtomicLock && ttlSeconds) {
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
        if (isAtomicLock) {
            const existing = this.fallbackCache.get(key);
            if (existing && existing.expires > Date.now())
                return null;
        }
        this.fallbackCache.set(key, {
            value,
            expires: Date.now() + ((ttlSeconds || 0) * 1000)
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
        const value = await this.get(key);
        return value !== null;
    }
    async incr(key, ttlSeconds) {
        await this.ensureConnection();
        if (this.client && this.isRedisAvailable) {
            try {
                const value = await this.client.incr(key);
                if (ttlSeconds)
                    await this.client.expire(key, ttlSeconds);
                return value;
            }
            catch (error) {
                console.error('[Redis] INCR failed:', error.message);
            }
        }
        const current = await this.get(key);
        const newValue = (parseInt(current || '0') + 1).toString();
        await this.set(key, newValue, ttlSeconds || 3600);
        return parseInt(newValue);
    }
    async close() {
        if (this.client) {
            await this.client.quit();
        }
        this.fallbackCache.clear();
    }
}
exports.RedisService = RedisService;
// Singleton
let redisInstance = null;
function getRedis() {
    if (!redisInstance) {
        redisInstance = new RedisService();
    }
    return redisInstance;
}
