import type { Redis } from "ioredis";
import { createLogger } from "@sentinel/telemetry";

const logger = createLogger({ name: "scan-lifecycle" });
const KEY_PREFIX = "sentinel.scan.lifecycle";
const LIFECYCLE_TTL = 3600;

export class ScanLifecycleTracker {
  constructor(private redis: Redis) {}

  async recordTrigger(scanId: string, jobName: string): Promise<void> {
    const key = `${KEY_PREFIX}:${scanId}`;
    await this.redis.hset(key, "status", "pending", "jobName", jobName, "triggeredAt", new Date().toISOString());
    await this.redis.expire(key, LIFECYCLE_TTL);
  }

  async recordCompletion(scanId: string): Promise<void> {
    const key = `${KEY_PREFIX}:${scanId}`;
    await this.redis.hset(key, "status", "completed", "completedAt", new Date().toISOString());
  }

  async checkTimeouts(timeoutMs: number = 300_000): Promise<string[]> {
    const timedOut: string[] = [];
    const keys = await this.redis.keys(`${KEY_PREFIX}:*`);
    for (const key of keys) {
      const data = await this.redis.hgetall(key);
      if (!data || data.status === "completed" || data.status === "timeout") continue;
      const triggeredAt = new Date(data.triggeredAt).getTime();
      if (Date.now() - triggeredAt > timeoutMs) {
        const scanId = key.replace(`${KEY_PREFIX}:`, "");
        timedOut.push(scanId);
        await this.redis.hset(key, "status", "timeout");
        logger.warn({ scanId, triggeredAt: data.triggeredAt }, "Scheduled scan timed out");
      }
    }
    return timedOut;
  }

  async getLifecycle(scanId: string): Promise<Record<string, string> | null> {
    const data = await this.redis.hgetall(`${KEY_PREFIX}:${scanId}`);
    return Object.keys(data).length > 0 ? data : null;
  }
}
