// server/services/redis.ts
// Handles webhook deduplication and caching

import { Redis } from 'ioredis';

export class RedisService {
  private client: Redis | null = null;
  private fallbackCache: Map<string, { value: string; expires: number }> = new Map();
  private isRedisAvailable = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    const redisUrl = process.env.REDIS_URL;
    
    if (!redisUrl) {
      console.warn('[Redis] No REDIS_URL found. Using in-memory fallback.');
      this.setupFallbackCleanup();
      return;
    }

    try {
      this.client = new Redis(redisUrl, {
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

    } catch (error: any) {
      console.error('[Redis] Initialization failed:', error.message);
      this.setupFallbackCleanup();
    }
  }

  /**
   * Cleanup expired entries from fallback cache every 5 minutes
   */
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

  /**
   * Get value from Redis or fallback cache
   */
  async get(key: string): Promise<string | null> {
    if (this.client && this.isRedisAvailable) {
      try {
        return await this.client.get(key);
      } catch (error: any) {
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
   * Set value with TTL (seconds)
   */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.client && this.isRedisAvailable) {
      try {
        await this.client.setex(key, ttlSeconds, value);
        return;
      } catch (error: any) {
        console.error('[Redis] SET failed:', error.message);
      }
    }

    // Fallback to in-memory
    this.fallbackCache.set(key, {
      value,
      expires: Date.now() + (ttlSeconds * 1000)
    });
  }

  /**
   * Delete key
   */
  async del(key: string): Promise<void> {
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

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Increment counter
   */
  async incr(key: string, ttlSeconds?: number): Promise<number> {
    if (this.client && this.isRedisAvailable) {
      try {
        const value = await this.client.incr(key);
        if (ttlSeconds) {
          await this.client.expire(key, ttlSeconds);
        }
        return value;
      } catch (error: any) {
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
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
    this.fallbackCache.clear();
  }
}

// Singleton instance
let redisInstance: RedisService | null = null;

export function getRedis(): RedisService {
  if (!redisInstance) {
    redisInstance = new RedisService();
  }
  return redisInstance;
}
