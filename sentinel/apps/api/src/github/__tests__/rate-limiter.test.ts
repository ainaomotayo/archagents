import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, RATE_LIMIT_MAX } from "../rate-limiter.js";

function createRedisMock() {
  const store = new Map<string, number>();
  return {
    incr: async (key: string) => {
      const val = (store.get(key) ?? 0) + 1;
      store.set(key, val);
      return val;
    },
    expire: async (_key: string, _ttl: number) => {},
    _store: store,
  };
}

describe("checkRateLimit", () => {
  let redis: ReturnType<typeof createRedisMock>;

  beforeEach(() => {
    redis = createRedisMock();
  });

  it("allows requests under limit", async () => {
    const ok = await checkRateLimit(redis as any, 12345);
    expect(ok).toBe(true);
  });

  it("rejects requests at limit", async () => {
    redis._store.set("github:ratelimit:12345", RATE_LIMIT_MAX);
    const ok = await checkRateLimit(redis as any, 12345);
    expect(ok).toBe(false);
  });

  it("tracks per-installation", async () => {
    redis._store.set("github:ratelimit:111", RATE_LIMIT_MAX);
    const blocked = await checkRateLimit(redis as any, 111);
    const allowed = await checkRateLimit(redis as any, 222);
    expect(blocked).toBe(false);
    expect(allowed).toBe(true);
  });
});
