import { describe, it, expect } from "vitest";
import { AuthRateLimiter } from "@sentinel/security";

describe("API key rate limiting", () => {
  it("blocks after max attempts exceeded", () => {
    const limiter = new AuthRateLimiter({ maxAttempts: 3, windowMs: 60000, lockoutMs: 300000 });
    limiter.record("10.0.0.1");
    limiter.record("10.0.0.1");
    limiter.record("10.0.0.1");
    const result = limiter.check("10.0.0.1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows loopback addresses always", () => {
    const limiter = new AuthRateLimiter({ maxAttempts: 1, windowMs: 60000, lockoutMs: 300000 });
    limiter.record("127.0.0.1");
    limiter.record("127.0.0.1");
    expect(limiter.check("127.0.0.1").allowed).toBe(true);
  });

  it("resets after successful auth", () => {
    const limiter = new AuthRateLimiter({ maxAttempts: 3, windowMs: 60000, lockoutMs: 300000 });
    limiter.record("10.0.0.1");
    limiter.record("10.0.0.1");
    limiter.reset("10.0.0.1");
    expect(limiter.check("10.0.0.1").remaining).toBe(3);
  });
});

describe("API key lastUsedAt", () => {
  it("updateApiKeyLastUsed option is accepted by createAuthHook", async () => {
    const { createAuthHook } = await import("../middleware/auth.js");
    const hook = createAuthHook({
      getOrgSecret: async () => "secret",
      updateApiKeyLastUsed: (_prefix: string) => {},
    });
    expect(typeof hook).toBe("function");
  });
});
