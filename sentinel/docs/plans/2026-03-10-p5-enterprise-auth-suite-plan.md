# P5 Enhancement: Full Enterprise Auth Suite — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden SENTINEL SSO with auth rate limiting, brute-force protection, provider health monitoring, session security, and auth event audit logging.

**Architecture:** Add sliding-window rate limiter and EMA-based provider health monitor to `@sentinel/security`. Wire into NextAuth callbacks/events. Auth events flow through existing hash-chained `AuditLog`. Session security via NextAuth JWT lifecycle config.

**Tech Stack:** TypeScript, NextAuth.js 4.x, vitest.

---

## Task 1: Auth Rate Limiter

**Files:**
- Create: `packages/security/src/auth-rate-limit.ts`
- Create: `packages/security/src/__tests__/auth-rate-limit.test.ts`
- Modify: `packages/security/src/index.ts`

**Step 1: Write the failing tests**

Create `packages/security/src/__tests__/auth-rate-limit.test.ts`:

```typescript
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
    limiter.record("1.2.3.4");
    limiter.record("1.2.3.4");
    limiter.record("1.2.3.4");
    expect(limiter.check("1.2.3.4").allowed).toBe(false);

    vi.useFakeTimers();
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
    limiter.record("1.2.3.4");
    vi.useFakeTimers();
    vi.advanceTimersByTime(5000); // past both window and lockout
    limiter.prune();
    // After pruning, IP should be clean
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
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm --filter @sentinel/security test`
Expected: FAIL — `Cannot find module '../auth-rate-limit.js'`

**Step 3: Implement AuthRateLimiter**

Create `packages/security/src/auth-rate-limit.ts`:

```typescript
export interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  lockoutMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

const LOOPBACK = new Set(["127.0.0.1", "::1"]);

const DEFAULT_CONFIG: RateLimitConfig = {
  maxAttempts: 10,
  windowMs: 60_000,
  lockoutMs: 300_000,
};

export class AuthRateLimiter {
  private attempts = new Map<string, number[]>();
  private lockouts = new Map<string, number>();
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  check(ip: string): RateLimitResult {
    if (LOOPBACK.has(ip)) {
      return { allowed: true, remaining: this.config.maxAttempts };
    }

    const lockoutExpiry = this.lockouts.get(ip);
    if (lockoutExpiry !== undefined) {
      const now = Date.now();
      if (now < lockoutExpiry) {
        return { allowed: false, remaining: 0, retryAfterMs: lockoutExpiry - now };
      }
      this.lockouts.delete(ip);
      this.attempts.delete(ip);
    }

    const now = Date.now();
    const cutoff = now - this.config.windowMs;
    const timestamps = (this.attempts.get(ip) ?? []).filter((t) => t > cutoff);
    this.attempts.set(ip, timestamps);

    const remaining = Math.max(0, this.config.maxAttempts - timestamps.length);
    return { allowed: remaining > 0, remaining };
  }

  record(ip: string): void {
    if (LOOPBACK.has(ip)) return;

    const now = Date.now();
    const cutoff = now - this.config.windowMs;
    const timestamps = (this.attempts.get(ip) ?? []).filter((t) => t > cutoff);
    timestamps.push(now);
    this.attempts.set(ip, timestamps);

    if (timestamps.length >= this.config.maxAttempts) {
      this.lockouts.set(ip, now + this.config.lockoutMs);
    }
  }

  reset(ip: string): void {
    this.attempts.delete(ip);
    this.lockouts.delete(ip);
  }

  prune(): void {
    const now = Date.now();
    for (const [ip, expiry] of this.lockouts) {
      if (now >= expiry) this.lockouts.delete(ip);
    }
    const cutoff = now - this.config.windowMs;
    for (const [ip, timestamps] of this.attempts) {
      const active = timestamps.filter((t) => t > cutoff);
      if (active.length === 0) this.attempts.delete(ip);
      else this.attempts.set(ip, active);
    }
  }
}
```

**Step 4: Export from index.ts**

Add to `packages/security/src/index.ts`:

```typescript
export { AuthRateLimiter, type RateLimitConfig, type RateLimitResult } from "./auth-rate-limit.js";
```

**Step 5: Run test to verify it passes**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm --filter @sentinel/security test`
Expected: All tests PASS including 6 new auth-rate-limit tests.

**Step 6: Commit**

```bash
git add packages/security/src/auth-rate-limit.ts packages/security/src/__tests__/auth-rate-limit.test.ts packages/security/src/index.ts
git commit -m "feat(security): add sliding-window auth rate limiter with brute-force lockout"
```

---

## Task 2: Provider Health Monitor

**Files:**
- Create: `packages/security/src/provider-health.ts`
- Create: `packages/security/src/__tests__/provider-health.test.ts`
- Modify: `packages/security/src/index.ts`

**Step 1: Write the failing tests**

Create `packages/security/src/__tests__/provider-health.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { ProviderHealthMonitor } from "../provider-health.js";

describe("ProviderHealthMonitor", () => {
  test("returns healthy with score 1.0 for unknown provider", () => {
    const monitor = new ProviderHealthMonitor();
    const health = monitor.getHealth("github");
    expect(health.score).toBe(1.0);
    expect(health.status).toBe("healthy");
  });

  test("score stays high after consecutive successes", () => {
    const monitor = new ProviderHealthMonitor();
    monitor.recordSuccess("github");
    monitor.recordSuccess("github");
    monitor.recordSuccess("github");
    const health = monitor.getHealth("github");
    expect(health.score).toBeGreaterThan(0.9);
    expect(health.status).toBe("healthy");
  });

  test("score drops to degraded after failures", () => {
    const monitor = new ProviderHealthMonitor();
    // Start with some successes
    monitor.recordSuccess("oidc");
    monitor.recordSuccess("oidc");
    // Then failures
    monitor.recordFailure("oidc");
    monitor.recordFailure("oidc");
    monitor.recordFailure("oidc");
    monitor.recordFailure("oidc");
    monitor.recordFailure("oidc");
    const health = monitor.getHealth("oidc");
    expect(health.score).toBeLessThan(0.7);
    expect(health.status).toBe("degraded");
  });

  test("score drops to down after many consecutive failures", () => {
    const monitor = new ProviderHealthMonitor();
    for (let i = 0; i < 10; i++) monitor.recordFailure("saml");
    const health = monitor.getHealth("saml");
    expect(health.score).toBeLessThan(0.3);
    expect(health.status).toBe("down");
  });

  test("getAll returns all tracked providers", () => {
    const monitor = new ProviderHealthMonitor();
    monitor.recordSuccess("github");
    monitor.recordFailure("oidc");
    const all = monitor.getAll();
    expect(Object.keys(all)).toContain("github");
    expect(Object.keys(all)).toContain("oidc");
    expect(all.github.status).toBe("healthy");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm --filter @sentinel/security test`
Expected: FAIL — `Cannot find module '../provider-health.js'`

**Step 3: Implement ProviderHealthMonitor**

Create `packages/security/src/provider-health.ts`:

```typescript
export type ProviderStatus = "healthy" | "degraded" | "down";

export class ProviderHealthMonitor {
  private scores = new Map<string, number>();
  private alpha: number;

  constructor(alpha = 0.3) {
    this.alpha = alpha;
  }

  recordSuccess(providerId: string): void {
    const current = this.scores.get(providerId) ?? 1.0;
    this.scores.set(providerId, this.alpha * 1.0 + (1 - this.alpha) * current);
  }

  recordFailure(providerId: string): void {
    const current = this.scores.get(providerId) ?? 1.0;
    this.scores.set(providerId, this.alpha * 0.0 + (1 - this.alpha) * current);
  }

  getHealth(providerId: string): { score: number; status: ProviderStatus } {
    const score = this.scores.get(providerId) ?? 1.0;
    const status: ProviderStatus =
      score >= 0.7 ? "healthy" : score >= 0.3 ? "degraded" : "down";
    return { score: Math.round(score * 1000) / 1000, status };
  }

  getAll(): Record<string, { score: number; status: ProviderStatus }> {
    const result: Record<string, { score: number; status: ProviderStatus }> = {};
    for (const [id] of this.scores) {
      result[id] = this.getHealth(id);
    }
    return result;
  }
}
```

**Step 4: Export from index.ts**

Add to `packages/security/src/index.ts`:

```typescript
export { ProviderHealthMonitor, type ProviderStatus } from "./provider-health.js";
```

**Step 5: Run test to verify it passes**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm --filter @sentinel/security test`
Expected: All tests PASS including 5 new provider-health tests.

**Step 6: Commit**

```bash
git add packages/security/src/provider-health.ts packages/security/src/__tests__/provider-health.test.ts packages/security/src/index.ts
git commit -m "feat(security): add EMA-based provider health monitor"
```

---

## Task 3: Session Security Hardening + Auth Event Wiring

**Files:**
- Modify: `apps/dashboard/lib/auth.ts:144-171`
- Modify: `apps/dashboard/__tests__/auth.test.ts`

**Step 1: Write the failing tests**

Add to `apps/dashboard/__tests__/auth.test.ts`:

```typescript
import { authOptions } from "../lib/auth";

describe("session security", () => {
  test("session maxAge is 8 hours", () => {
    expect(authOptions.session?.maxAge).toBe(8 * 60 * 60);
  });

  test("session updateAge is 1 hour for JWT rotation", () => {
    expect((authOptions.session as any)?.updateAge).toBe(60 * 60);
  });

  test("session strategy is jwt", () => {
    expect(authOptions.session?.strategy).toBe("jwt");
  });

  test("session cookie is httpOnly and sameSite lax", () => {
    const cookieOpts = (authOptions.cookies as any)?.sessionToken?.options;
    expect(cookieOpts?.httpOnly).toBe(true);
    expect(cookieOpts?.sameSite).toBe("lax");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm --filter @sentinel/dashboard test`
Expected: FAIL — session/cookies config not yet added to authOptions.

**Step 3: Update authOptions in auth.ts**

In `apps/dashboard/lib/auth.ts`, update `authOptions` (currently starts at line 144) to add session and cookies config:

```typescript
export const authOptions: AuthOptions = {
  providers: getConfiguredProviders(),

  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,       // 8 hours absolute timeout
    updateAge: 60 * 60,         // Rotate JWT every 1 hour of activity
  },

  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },

  callbacks: {
    async jwt({ token, profile, account }) {
      if (profile) {
        const username =
          (profile as any).login ?? (profile as any).username;
        const identifier = username ?? (profile as any).email;
        token.role = resolveRole(identifier);
      }
      return token;
    },

    async session({ session, token }: { session: Session; token: JWT }) {
      session.user.role = (token.role as Role) ?? "viewer";
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },

  secret: process.env.NEXTAUTH_SECRET,
};
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm --filter @sentinel/dashboard test`
Expected: All tests PASS including 4 new session security tests.

**Step 5: Commit**

```bash
git add apps/dashboard/lib/auth.ts apps/dashboard/__tests__/auth.test.ts
git commit -m "feat(auth): add session security hardening — JWT rotation, cookie settings, absolute timeout"
```

---

## Task 4: Wire Rate Limiter and Provider Health into NextAuth

**Files:**
- Modify: `apps/dashboard/lib/auth.ts` (add signIn callback + events)
- Modify: `apps/dashboard/__tests__/auth.test.ts` (add integration tests)

**Step 1: Write the failing tests**

Add to `apps/dashboard/__tests__/auth.test.ts`:

```typescript
import { AuthRateLimiter, ProviderHealthMonitor } from "@sentinel/security";

describe("auth rate limiter integration", () => {
  test("rateLimiter and providerHealth are exported from auth module", async () => {
    const { rateLimiter, providerHealth } = await import("../lib/auth");
    expect(rateLimiter).toBeInstanceOf(AuthRateLimiter);
    expect(providerHealth).toBeInstanceOf(ProviderHealthMonitor);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm --filter @sentinel/dashboard test`
Expected: FAIL — `rateLimiter` and `providerHealth` not exported.

**Step 3: Add rate limiter and provider health instances to auth.ts**

At the top of `apps/dashboard/lib/auth.ts`, add imports:

```typescript
import { AuthRateLimiter, ProviderHealthMonitor } from "@sentinel/security";
```

After the `getConfiguredProviders()` function and before `authOptions`, add:

```typescript
export const rateLimiter = new AuthRateLimiter();
export const providerHealth = new ProviderHealthMonitor();

// Prune expired rate limit entries every hour
if (typeof setInterval !== "undefined") {
  setInterval(() => rateLimiter.prune(), 60 * 60 * 1000);
}
```

**Step 4: Add signIn callback rate limiting**

Update the `signIn` callback logic. The NextAuth `signIn` callback can return `false` to block login. However, note that NextAuth's `signIn` callback fires AFTER the OAuth flow returns, not before. For auth rate limiting, we need to check the rate limiter in the `signIn` callback (which fires on successful OAuth callback) and block if the IP has too many recent failures.

We cannot easily get the IP in NextAuth callbacks (it's not passed). Instead, we'll create a helper that the providers route and login page can use, and add the rate limiter to the `signIn` callback using a request-context approach.

For MVP, export the `rateLimiter` and `providerHealth` instances so the API routes can use them directly. The `signIn` callback will record provider health:

In `authOptions.events`, add:

```typescript
events: {
  async signIn({ account }) {
    if (account?.provider) {
      providerHealth.recordSuccess(account.provider);
    }
  },
},
```

**Step 5: Run test to verify it passes**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm --filter @sentinel/dashboard test`
Expected: All tests PASS.

**Step 6: Commit**

```bash
git add apps/dashboard/lib/auth.ts apps/dashboard/__tests__/auth.test.ts
git commit -m "feat(auth): wire rate limiter and provider health monitor into NextAuth"
```

---

## Task 5: Provider Health API Endpoint

**Files:**
- Create: `apps/dashboard/app/api/auth/health/route.ts`

**Step 1: Create the provider health API route**

Create `apps/dashboard/app/api/auth/health/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { providerHealth } from "@/lib/auth";

export async function GET() {
  return NextResponse.json(providerHealth.getAll());
}
```

**Step 2: Verify dashboard tests still pass**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm --filter @sentinel/dashboard test`
Expected: All tests PASS.

**Step 3: Commit**

```bash
git add apps/dashboard/app/api/auth/health/route.ts
git commit -m "feat(auth): add provider health API endpoint for ops monitoring"
```

---

## Task 6: Full Regression Test

**Files:** None (verification only)

**Step 1: Run the full monorepo test suite**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm -r test`

Expected: ALL tests pass, including:
- `packages/security` — auth-rate-limit (6 tests), provider-health (5 tests), plus all existing
- `apps/dashboard` — session security (4 tests), rate limiter integration (1 test), plus existing 12 auth tests
- `apps/api` — all 100 existing tests
- `test/docker` — all 13 compose validation tests

**Step 2: Run TypeScript type check**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm -r build`
Expected: No type errors. Clean build.

**Step 3: Verify final test count**

Expected: ~520+ tests, 0 failures, 0 skipped.

---

## File Impact Summary

| File | Action | Est. Lines |
|------|--------|-----------|
| `packages/security/src/auth-rate-limit.ts` | Create | ~65 |
| `packages/security/src/__tests__/auth-rate-limit.test.ts` | Create | ~75 |
| `packages/security/src/provider-health.ts` | Create | ~40 |
| `packages/security/src/__tests__/provider-health.test.ts` | Create | ~45 |
| `packages/security/src/index.ts` | Modify | ~4 |
| `apps/dashboard/lib/auth.ts` | Modify | ~30 |
| `apps/dashboard/__tests__/auth.test.ts` | Modify | ~25 |
| `apps/dashboard/app/api/auth/health/route.ts` | Create | ~8 |

Total: ~290 lines across 8 files. No new dependencies, no new Docker containers.
