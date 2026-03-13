import { describe, test, expect, vi, beforeEach } from "vitest";
import { RedisLeaderLease } from "../leader-lease.js";

function createMockRedis() {
  const store = new Map<string, string>();
  return {
    set: vi.fn(async (key: string, value: string, ...args: string[]) => {
      if (args.includes("NX")) {
        if (store.has(key)) return null;
        store.set(key, value);
        return "OK";
      }
      store.set(key, value);
      return "OK";
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    eval: vi.fn(async () => 1),
    _store: store,
  };
}

describe("RedisLeaderLease", () => {
  let redis: ReturnType<typeof createMockRedis>;
  let lease: RedisLeaderLease;

  beforeEach(() => {
    redis = createMockRedis();
    lease = new RedisLeaderLease(redis as any, {
      key: "sentinel.scheduler.leader",
      ttlMs: 10000,
      instanceId: "instance-1",
    });
  });

  test("acquire succeeds when no leader exists", async () => {
    const acquired = await lease.acquire();
    expect(acquired).toBe(true);
    expect(lease.isLeader()).toBe(true);
    expect(redis.set).toHaveBeenCalledWith(
      "sentinel.scheduler.leader",
      "instance-1",
      "PX", 10000,
      "NX",
    );
  });

  test("acquire fails when another leader holds the lock", async () => {
    redis._store.set("sentinel.scheduler.leader", "instance-2");
    const acquired = await lease.acquire();
    expect(acquired).toBe(false);
    expect(lease.isLeader()).toBe(false);
  });

  test("renew succeeds when we are the leader", async () => {
    await lease.acquire();
    redis.eval.mockResolvedValueOnce(1);
    const renewed = await lease.renew();
    expect(renewed).toBe(true);
  });

  test("renew fails when we are not the leader", async () => {
    redis.eval.mockResolvedValueOnce(0);
    const renewed = await lease.renew();
    expect(renewed).toBe(false);
  });

  test("release deletes the key when we are the leader", async () => {
    await lease.acquire();
    redis.eval.mockResolvedValueOnce(1);
    await lease.release();
    expect(lease.isLeader()).toBe(false);
  });
});
