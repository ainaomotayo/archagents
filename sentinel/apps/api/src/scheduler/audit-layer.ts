import type { Redis } from "ioredis";
import type { AuditLog } from "@sentinel/audit";
import type { AuditLayer, SchedulerAuditEntry } from "./types.js";
import { createLogger } from "@sentinel/telemetry";

const logger = createLogger({ name: "scheduler-audit" });
const STREAM_KEY = "sentinel.scheduler.audit";
const STREAM_TTL = 86400;

export class DualAuditLayer implements AuditLayer {
  constructor(
    private redis: Redis,
    private auditLog: AuditLog | null,
  ) {}

  async log(entry: SchedulerAuditEntry): Promise<void> {
    try {
      await this.redis.xadd(STREAM_KEY, "*", "data", JSON.stringify(entry));
      await this.redis.expire(STREAM_KEY, STREAM_TTL);
    } catch (err) {
      logger.warn({ err, entry }, "Failed to write scheduler audit to Redis");
    }

    if (this.auditLog) {
      try {
        await this.auditLog.append("system", {
          actor: { type: "system", id: "scheduler", name: "sentinel-scheduler" },
          action: `scheduler.${entry.action}`,
          resource: { type: "scheduler-job", id: entry.jobName },
          detail: { ...entry.detail, timestamp: entry.timestamp },
        });
      } catch (err) {
        logger.warn({ err, entry }, "Failed to write scheduler audit to PostgreSQL");
      }
    }
  }

  async recent(limit: number = 50): Promise<SchedulerAuditEntry[]> {
    try {
      const results = await this.redis.xrevrange(STREAM_KEY, "+", "-", "COUNT", limit);
      return results.map(([_id, fields]: [string, string[]]) => {
        const dataIdx = fields.indexOf("data");
        if (dataIdx === -1 || dataIdx + 1 >= fields.length) return null;
        return JSON.parse(fields[dataIdx + 1]) as SchedulerAuditEntry;
      }).filter(Boolean) as SchedulerAuditEntry[];
    } catch (err) {
      logger.warn({ err }, "Failed to read scheduler audit from Redis");
      return [];
    }
  }
}
