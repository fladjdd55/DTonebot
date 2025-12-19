// server/services/redis.ts
// Handles webhook deduplication and caching

import { Redis } from 'ioredis';

export class RedisService {
  private client: Redis | null = null;
  private fallbackCache: Map<string, { value: string; expires: number }> = new Map();
  private isRedisAvailable = false;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    // Removed automatic initialize() to allow lazy loading
  }

  /**
   * Ensures Redis is connected before performing operations
   */
  private async ensureConnection() {
    if (this.client || this.isRedisAvailable) return;
    
    // Prevent multiple simultaneous connection attempts
    if (!this.initializationPromise) {
      this.initializationPromise = this.initialize();
    }
    await this.initializationPromise;
  }

  private async initialize() {
    const redisUrl = process.env.REDIS_URL;
    
    if (!redisUrl) {
      console.warn('[Redis] ⚠️ No REDIS_URL found in .env. Using in-memory fallback.');
      this.setupFallbackCleanup();
      return;
    }

    try {
      console.log('[Redis] 🔌 Connecting to Redis Cloud...');
      this.client = new Redis(redisUrl, {
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
      await new Promise<void>((resolve) => {
        this.client?.once('connect', () => resolve());
        // Don't block forever if it fails
        setTimeout(resolve, 2000); 
      });

    } catch (error: any) {
      console.error('[Redis] ❌ Initialization failed:', error.message);
      this.setupFallbackCleanup();
    }
  }

  private setupFallbackCleanup() {
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
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    await this.ensureConnection();
    
    if (this.client && this.isRedisAvailable) {
      try {
        const result = await this.client.expire(key, ttlSeconds);
        return result === 1;
      } catch (error: any) {
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

  async get(key: string): Promise<string | null> {
    await this.ensureConnection();

    if (this.client && this.isRedisAvailable) {
      try {
        return await this.client.get(key);
      } catch (error: any) {
        console.error('[Redis] GET failed:', error.message);
      }
    }

    const cached = this.fallbackCache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }
    return null;
  }

  async set(
    key: string, 
    value: string, 
    arg3: number | string, 
    arg4?: number, 
    arg5?: string
  ): Promise<string | null> {
    await this.ensureConnection();
    
    const isAtomicLock = typeof arg3 === 'string' && arg3 === 'EX' && arg5 === 'NX';
    const ttlSeconds = isAtomicLock ? arg4 : (arg3 as number);

    if (this.client && this.isRedisAvailable) {
      try {
        if (isAtomicLock && ttlSeconds) {
           return await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
        } 
        if (ttlSeconds) {
           await this.client.setex(key, ttlSeconds, value);
           return 'OK';
        }
      } catch (error: any) {
        console.error('[Redis] SET failed:', error.message);
      }
    }

    if (isAtomicLock) {
       const existing = this.fallbackCache.get(key);
       if (existing && existing.expires > Date.now()) return null;
    }

    this.fallbackCache.set(key, {
      value,
      expires: Date.now() + ((ttlSeconds || 0) * 1000)
    });
    
    return 'OK';
  }

  async del(key: string): Promise<void> {
    await this.ensureConnection();
    
    if (this.client && this.isRedisAvailable) {
      try {
        await this.client.del(key);
        return;
      } catch (error: any) {
        console.error('[Redis] DEL failed:', error.message);
      }
    }
    this.fallbackCache.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    await this.ensureConnection();

    if (this.client && this.isRedisAvailable) {
      try {
        const value = await this.client.incr(key);
        if (ttlSeconds) await this.client.expire(key, ttlSeconds);
        return value;
      } catch (error: any) {
        console.error('[Redis] INCR failed:', error.message);
      }
    }

    const current = await this.get(key);
    const newValue = (parseInt(current || '0') + 1).toString();
    await this.set(key, newValue, ttlSeconds || 3600);
    return parseInt(newValue);
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
    this.fallbackCache.clear();
  }
}

// Singleton
let redisInstance: RedisService | null = null;

export function getRedis(): RedisService {
  if (!redisInstance) {
    redisInstance = new RedisService();
  }
  return redisInstance;
}
