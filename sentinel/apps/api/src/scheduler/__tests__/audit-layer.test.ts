import { describe, test, expect, vi, beforeEach } from "vitest";
import { DualAuditLayer } from "../audit-layer.js";
import type { SchedulerAuditEntry } from "../types.js";

function createMockRedis() {
  const streams: Array<{ id: string; data: string }> = [];
  return {
    xadd: vi.fn(async (..._args: unknown[]) => {
      const id = `${Date.now()}-0`;
      streams.push({ id, data: String(_args[3]) });
      return id;
    }),
    xrevrange: vi.fn(async () => {
      return streams.map((s) => [
        s.id,
        ["data", s.data],
      ]);
    }),
    expire: vi.fn(async () => 1),
  };
}

function createMockAuditLog() {
  const entries: unknown[] = [];
  return {
    append: vi.fn(async (_orgId: string, input: unknown) => {
      entries.push(input);
      return input;
    }),
    _entries: entries,
  };
}

describe("DualAuditLayer", () => {
  let redis: ReturnType<typeof createMockRedis>;
  let auditLog: ReturnType<typeof createMockAuditLog>;
  let layer: DualAuditLayer;

  beforeEach(() => {
    redis = createMockRedis();
    auditLog = createMockAuditLog();
    layer = new DualAuditLayer(redis as any, auditLog as any);
  });

  test("log writes to both Redis stream and PostgreSQL audit log", async () => {
    const entry: SchedulerAuditEntry = {
      jobName: "self-scan",
      action: "triggered",
      timestamp: new Date().toISOString(),
      detail: { scanId: "scan-123" },
    };
    await layer.log(entry);
    expect(redis.xadd).toHaveBeenCalledTimes(1);
    expect(auditLog.append).toHaveBeenCalledTimes(1);
  });

  test("log continues if PostgreSQL write fails", async () => {
    auditLog.append.mockRejectedValueOnce(new Error("DB down"));
    const entry: SchedulerAuditEntry = {
      jobName: "retention",
      action: "failed",
      timestamp: new Date().toISOString(),
    };
    await layer.log(entry);
    expect(redis.xadd).toHaveBeenCalledTimes(1);
  });

  test("log works with null auditLog (Redis-only mode)", async () => {
    const redisOnly = new DualAuditLayer(redis as any, null);
    await redisOnly.log({
      jobName: "test",
      action: "triggered",
      timestamp: new Date().toISOString(),
    });
    expect(redis.xadd).toHaveBeenCalledTimes(1);
  });

  test("recent reads from Redis stream", async () => {
    await layer.log({
      jobName: "self-scan",
      action: "triggered",
      timestamp: new Date().toISOString(),
    });
    const entries = await layer.recent(10);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].jobName).toBe("self-scan");
  });
});
