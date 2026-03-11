// tests/e2e/helpers/redis-inspector.ts
import { Redis } from "ioredis";

export class RedisInspector {
  private redis: Redis;

  constructor(url?: string) {
    this.redis = new Redis(url ?? process.env.E2E_REDIS_URL ?? "redis://localhost:6380");
  }

  async getStreamEntries(stream: string, count = 100): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
    const entries = await this.redis.xrange(stream, "-", "+", "COUNT", count);
    return entries.map(([id, fields]) => {
      const dataIdx = fields.indexOf("data");
      const raw = dataIdx >= 0 ? fields[dataIdx + 1] : "{}";
      return { id, data: JSON.parse(raw) };
    });
  }

  async getStreamLength(stream: string): Promise<number> {
    return this.redis.xlen(stream);
  }

  async getConsumerGroupInfo(stream: string, group: string): Promise<unknown> {
    const groups = await this.redis.xinfo("GROUPS", stream);
    return (groups as unknown[][]).find((g: unknown[]) => g[1] === group);
  }

  async flushAll(): Promise<void> {
    await this.redis.flushall();
  }

  async disconnect(): Promise<void> {
    this.redis.disconnect();
  }
}
