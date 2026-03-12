import { describe, test, expect, vi, beforeEach } from "vitest";
import { ScanLifecycleTracker } from "../lifecycle-tracker.js";

function createMockRedis() {
  const hashes = new Map<string, Map<string, string>>();
  return {
    hset: vi.fn(async (key: string, ...args: string[]) => {
      if (!hashes.has(key)) hashes.set(key, new Map());
      const map = hashes.get(key)!;
      for (let i = 0; i < args.length; i += 2) {
        map.set(args[i], args[i + 1]);
      }
      return 1;
    }),
    hgetall: vi.fn(async (key: string) => {
      const map = hashes.get(key);
      if (!map || map.size === 0) return {};
      return Object.fromEntries(map);
    }),
    expire: vi.fn(async () => 1),
    del: vi.fn(async (key: string) => { hashes.delete(key); return 1; }),
    keys: vi.fn(async () => {
      return Array.from(hashes.keys()).filter(k => k.startsWith("sentinel.scan.lifecycle:"));
    }),
  };
}

describe("ScanLifecycleTracker", () => {
  let redis: ReturnType<typeof createMockRedis>;
  let tracker: ScanLifecycleTracker;

  beforeEach(() => {
    redis = createMockRedis();
    tracker = new ScanLifecycleTracker(redis as any);
  });

  test("recordTrigger stores pending state", async () => {
    await tracker.recordTrigger("scan-1", "self-scan");
    expect(redis.hset).toHaveBeenCalled();
    const call = redis.hset.mock.calls[0];
    expect(call[0]).toBe("sentinel.scan.lifecycle:scan-1");
    expect(call).toContain("pending");
    expect(call).toContain("self-scan");
  });

  test("recordCompletion updates to completed", async () => {
    await tracker.recordTrigger("scan-1", "self-scan");
    await tracker.recordCompletion("scan-1");
    const lastCall = redis.hset.mock.calls[redis.hset.mock.calls.length - 1];
    expect(lastCall).toContain("completed");
  });

  test("checkTimeouts returns scans pending longer than threshold", async () => {
    const oldTime = new Date(Date.now() - 600_000).toISOString();
    redis.keys.mockResolvedValueOnce(["sentinel.scan.lifecycle:scan-old"]);
    redis.hgetall.mockResolvedValueOnce({
      status: "pending",
      triggeredAt: oldTime,
      jobName: "self-scan",
    });
    const timedOut = await tracker.checkTimeouts(300_000);
    expect(timedOut).toContain("scan-old");
  });

  test("checkTimeouts ignores completed scans", async () => {
    redis.keys.mockResolvedValueOnce(["sentinel.scan.lifecycle:scan-done"]);
    redis.hgetall.mockResolvedValueOnce({
      status: "completed",
      triggeredAt: new Date(Date.now() - 600_000).toISOString(),
      completedAt: new Date().toISOString(),
      jobName: "self-scan",
    });
    const timedOut = await tracker.checkTimeouts(300_000);
    expect(timedOut).toHaveLength(0);
  });

  test("getLifecycle returns data for existing scan", async () => {
    await tracker.recordTrigger("scan-1", "self-scan");
    redis.hgetall.mockResolvedValueOnce({
      status: "pending",
      triggeredAt: new Date().toISOString(),
      jobName: "self-scan",
    });
    const data = await tracker.getLifecycle("scan-1");
    expect(data).not.toBeNull();
    expect(data!.status).toBe("pending");
  });

  test("getLifecycle returns null for unknown scan", async () => {
    redis.hgetall.mockResolvedValueOnce({});
    const data = await tracker.getLifecycle("nonexistent");
    expect(data).toBeNull();
  });
});
