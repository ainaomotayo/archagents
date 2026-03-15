import { describe, test, expect, beforeEach, vi } from "vitest";
import { AuthRateLimiter } from "../auth-rate-limit.js";

describe("AuthRateLimiter", () => {
  let limiter: AuthRateLimiter;

  beforeEach(() => {
    limiter = new AuthRateLimiter({ maxAttempts: 3, windowMs: 1000, lockoutMs: 2000 });
  });

  test("allows requests under the limit", () => {
    const result = limiter.check("1.2.3.4");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(3);
  });

  test("blocks after max failed attempts", () => {
    limiter.record("1.2.3.4");
    limiter.record("1.2.3.4");
    limiter.record("1.2.3.4");
    const result = limiter.check("1.2.3.4");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  test("lockout expires after lockoutMs", () => {
    vi.useFakeTimers();
    limiter.record("1.2.3.4");
    limiter.record("1.2.3.4");
    limiter.record("1.2.3.4");
    expect(limiter.check("1.2.3.4").allowed).toBe(false);

    vi.advanceTimersByTime(2001);
    const result = limiter.check("1.2.3.4");
    expect(result.allowed).toBe(true);
    vi.useRealTimers();
  });

  test("reset clears attempts and lockout for an IP", () => {
    limiter.record("1.2.3.4");
    limiter.record("1.2.3.4");
    limiter.record("1.2.3.4");
    expect(limiter.check("1.2.3.4").allowed).toBe(false);
    limiter.reset("1.2.3.4");
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
  });

  test("prune removes expired entries", () => {
    vi.useFakeTimers();
    limiter.record("1.2.3.4");
    vi.advanceTimersByTime(5000);
    limiter.prune();
    const result = limiter.check("1.2.3.4");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(3);
    vi.useRealTimers();
  });

  test("loopback addresses are always allowed", () => {
    const loopback = new AuthRateLimiter({ maxAttempts: 1, windowMs: 1000, lockoutMs: 2000 });
    loopback.record("127.0.0.1");
    loopback.record("127.0.0.1");
    expect(loopback.check("127.0.0.1").allowed).toBe(true);
    loopback.record("::1");
    loopback.record("::1");
    expect(loopback.check("::1").allowed).toBe(true);
  });
});
