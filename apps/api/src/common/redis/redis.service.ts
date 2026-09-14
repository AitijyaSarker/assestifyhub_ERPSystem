import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private readonly memory = new Map<string, { n: number; exp: number; value?: string }>();
  private readonly logger = new Logger(RedisService.name);

  async onModuleInit() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    try {
      await redis.connect();
      this.client = redis;
    } catch {
      this.logger.warn('Redis unavailable; using in-memory rate-limit fallback (dev/test only)');
      redis.disconnect();
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  async incrWindow(key: string, windowSeconds: number): Promise<number> {
    if (this.client) {
      const n = await this.client.incr(key);
      if (n === 1) await this.client.expire(key, windowSeconds);
      return n;
    }
    const now = Date.now();
    const row = this.memory.get(key);
    if (!row || row.exp < now) {
      this.memory.set(key, { n: 1, exp: now + windowSeconds * 1000 });
      return 1;
    }
    row.n += 1;
    return row.n;
  }

  async setJson<T>(key: string, value: T, ttlSeconds: number) {
    const serialized = JSON.stringify(value);
    if (this.client) {
      await this.client.set(key, serialized, 'EX', ttlSeconds);
      return;
    }
    this.memory.set(key, { n: 0, exp: Date.now() + ttlSeconds * 1000, value: serialized });
  }

  async getJson<T>(key: string): Promise<T | null> {
    const serialized = this.client
      ? await this.client.get(key)
      : (this.memory.get(key)?.exp ?? 0) > Date.now()
        ? this.memory.get(key)?.value ?? null
        : null;
    return serialized ? (JSON.parse(serialized) as T) : null;
  }

  async delete(key: string) {
    if (this.client) await this.client.del(key);
    else this.memory.delete(key);
  }
}
