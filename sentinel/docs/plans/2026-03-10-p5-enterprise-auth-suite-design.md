# P5 Enhancement: Full Enterprise Auth Suite — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden SENTINEL's existing SSO with auth rate limiting, brute-force protection, provider health monitoring, session security, and auth event audit logging.

**Architecture:** Add sliding-window rate limiter and EMA-based provider health monitor to `@sentinel/security`. Wire into NextAuth callbacks and events. Auth events flow through the existing hash-chained `AuditLog`. Session security via NextAuth JWT lifecycle config.

**Tech Stack:** TypeScript, NextAuth.js 4.x, vitest.

---

## Why These Changes

| Gap | Risk Without Fix | Enterprise Requirement |
|-----|-----------------|----------------------|
| No auth rate limiting | Brute-force credential stuffing attacks | OWASP A07:2021 — Identification & Authentication Failures |
| No login audit trail | Cannot detect account compromise, no compliance evidence | SOC 2 Type II, ISO 27001 A.12.4 |
| No session rotation | Session fixation attacks possible | NIST SP 800-63B |
| No provider health monitoring | Silent SSO outage, users locked out | SRE observability |
| No brute-force lockout | Unlimited login attempts | CIS Benchmark, PCI-DSS Req 8.1.6 |

---

## 3 Enterprise Approaches Evaluated

### Algorithms & Data Structures — Rate Limiting

**A. Fixed-Window Counter** — `Map<IP, { count, windowStart }>`. O(1) lookup. Problem: burst at window boundary allows 2x the limit (e.g., 10 requests at 59s + 10 at 61s = 20 in 2 seconds). Fragile for security-critical auth.

**B. Sliding-Window Log (OpenClaw pattern — Chosen)** — `Map<IP, timestamp[]>`. Store each attempt timestamp, filter to window on check. O(n) per check where n = attempts in window (bounded by max attempts = 10). Handles boundary bursts correctly. Memory bounded by max_attempts * active_IPs.

**C. Token Bucket (Suna/GitHub pattern)** — Tokens replenish at fixed rate. O(1) per check. Designed for sustained throughput limiting (API calls). Wrong fit for auth — we want hard cutoffs after N failures, not smooth rate shaping.

**Hybrid verdict: Not needed.** Sliding-window log is the correct choice for auth. Token bucket is for API throughput (already used for GitHub API in `rate-limiter.ts`). Fixed-window has boundary burst vulnerability. Sliding-window gives precise per-IP tracking — same pattern OpenClaw uses in production.

### Algorithms & Data Structures — Provider Health Tracking

**A. Simple Boolean Flag** — `Map<providerId, boolean>`. Mark down/up. No history, no gradual degradation detection. O(1) but loses temporal context.

**B. Exponential Moving Average (EMA) Health Score (Chosen)** — Track success rate as `score = alpha * latest + (1 - alpha) * previous`. Score 0.0-1.0 per provider. O(1) per update. Detects gradual degradation (score drops below threshold) and sudden failure (score plummets). Alpha = 0.3 gives ~10-sample effective memory.

**C. Circuit Breaker (Hystrix pattern)** — Three states: closed/open/half-open. Transitions on failure thresholds. More complex. Designed for call protection (stopping calls to failing service). Overkill — we never want to block SSO attempts, we just want observability.

**Hybrid verdict: Not needed.** EMA health score gives continuous monitoring with O(1) updates, captures both gradual and sudden degradation. Simpler than circuit breaker while providing richer signal than boolean.

### System Design — Auth Event Processing

**A. Synchronous Inline (Current Audit Pattern — Chosen)** — Auth events go directly to existing `AuditLog.append()` with hash-chaining. Same blockchain-style integrity as policy audit events. Latency: ~1-2ms per event (single DB write). Already battle-tested in SENTINEL.

**B. Async Event Bus (Suna pattern)** — Publish auth events to Redis stream, consume asynchronously. Decouples auth from logging. Risk: event loss on crash. Adds complexity for low-volume events (logins are rare vs scan findings).

**C. Dedicated Auth Event Store (OpenClaw pattern)** — Separate table with auth-specific schema (IP, user-agent, geolocation). Full session forensics. Adds new Prisma model, migration, query patterns.

**Hybrid verdict: Not needed.** Existing `AuditLog` is hash-chained and tamper-evident. Auth events have the same actor/action/resource shape. Zero new infrastructure, same compliance-grade integrity chain. Auth event volume (logins) is orders of magnitude lower than scan events.

### Software Design — Rate Limiter Architecture

**A. Application-Level Middleware (Chosen)** — NextAuth `signIn` callback. Rate limiter runs in-process with `Map<string, number[]>`. No external dependencies. Resets on restart (acceptable — defense-in-depth, not sole protection).

**B. Redis-Backed Distributed Rate Limiter** — Store attempt counts in Redis. Survives restarts, works across replicas. Adds Redis dependency to dashboard (currently none). Overkill for single-replica MVP.

**C. Edge/CDN Rate Limiting (Cloudflare/AWS WAF)** — Rate limiting at network edge. Best performance, but requires specific infrastructure. Not portable across deployment targets.

**Hybrid verdict: Not needed.** Application-level is correct for SENTINEL's deployment model (single dashboard replica). When customers scale to multi-replica, they'll already have a WAF/CDN. In-process `Map` is the same pattern OpenClaw uses.

### Software Design — Session Security

**A. JWT Rotation via NextAuth maxAge + updateAge (Chosen)** — Configure `session.maxAge` (absolute timeout) and `session.updateAge` (sliding window rotation). NextAuth automatically re-signs JWT on active sessions. Zero custom code.

**B. Server-Side Sessions with Database Store** — Replace JWT with server-side sessions. Full revocation. Adds per-request DB queries. Changes auth architecture fundamentally.

**C. Refresh Token Rotation with JWKS (Suna pattern)** — Asymmetric JWT signing with key rotation. Supports distributed verification. Overkill for single-service dashboard.

**Hybrid verdict: Not needed.** NextAuth's built-in JWT lifecycle gives rotation, absolute timeout, and sliding expiry with zero custom code.

---

## Component Design

### 1. Auth Rate Limiter (`packages/security/src/auth-rate-limit.ts`)

```typescript
export interface RateLimitConfig {
  maxAttempts: number;    // Default: 10
  windowMs: number;       // Default: 60_000 (60s)
  lockoutMs: number;      // Default: 300_000 (5min)
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

export class AuthRateLimiter {
  private attempts = new Map<string, number[]>();
  private lockouts = new Map<string, number>();

  constructor(private config: RateLimitConfig = DEFAULTS) {}

  check(ip: string): RateLimitResult
  record(ip: string): void       // Record failed attempt
  reset(ip: string): void        // Clear on successful login
  prune(): void                   // Hourly cleanup of expired entries
}
```

Loopback exemption: `127.0.0.1` and `::1` always allowed (local dev).

### 2. Provider Health Monitor (`packages/security/src/provider-health.ts`)

```typescript
export type ProviderStatus = "healthy" | "degraded" | "down";

export class ProviderHealthMonitor {
  private scores = new Map<string, number>();
  private alpha = 0.3;

  recordSuccess(providerId: string): void
  recordFailure(providerId: string): void
  getHealth(providerId: string): { score: number; status: ProviderStatus }
  getAll(): Record<string, { score: number; status: ProviderStatus }>
}
```

Thresholds: healthy >= 0.7, degraded >= 0.3, down < 0.3.

### 3. Auth Event Audit Logging

New auth event actions via existing `AuditLog`:
- `auth.login.success` — user, provider, IP
- `auth.login.failed` — user (if known), provider, IP, reason
- `auth.login.rate_limited` — IP, remaining lockout time
- `auth.provider.degraded` — providerId, health score

Actor type: `"user"` with IP from `x-forwarded-for` or request IP.

### 4. Session Security (NextAuth config)

```typescript
session: {
  strategy: "jwt",
  maxAge: 8 * 60 * 60,      // 8h absolute timeout
  updateAge: 60 * 60,        // Rotate every 1h of activity
},
cookies: {
  sessionToken: {
    options: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" },
  },
},
```

### 5. NextAuth Integration (wire into callbacks/events)

```typescript
callbacks: {
  async signIn({ user, account }) {
    const ip = getClientIp(request);
    const result = rateLimiter.check(ip);
    if (!result.allowed) {
      auditLog.append(orgId, { actor: { type: "user", id: ip, name: "unknown", ip },
        action: "auth.login.rate_limited", ... });
      return false;
    }
    return true;
  },
},
events: {
  async signIn({ user, account }) {
    providerHealth.recordSuccess(account.provider);
    rateLimiter.reset(ip);
    auditLog.append(orgId, { action: "auth.login.success", ... });
  },
}
```

### 6. Provider Health API Endpoint

Add `GET /api/auth/health` returning provider health scores for ops monitoring:
```json
{ "github": { "score": 0.95, "status": "healthy" },
  "oidc": { "score": 0.45, "status": "degraded" } }
```

---

## Data Flow

```
User clicks "Sign in"
    |
    v
NextAuth signIn callback
    +-- AuthRateLimiter.check(ip)
    |       +-- BLOCKED -> AuditLog(auth.login.rate_limited) -> return false
    |       +-- ALLOWED -> continue to OAuth
    |
    v
OAuth flow (success or failure)
    |
    +-- SUCCESS:
    |       +-- ProviderHealth.recordSuccess(provider)
    |       +-- RateLimiter.reset(ip)
    |       +-- AuditLog(auth.login.success)
    |       +-- JWT issued (maxAge=8h, rotated every 1h)
    |
    +-- FAILURE:
            +-- ProviderHealth.recordFailure(provider)
            +-- RateLimiter.record(ip)
            +-- AuditLog(auth.login.failed)
```

## Error Handling

| Failure | Behavior | Recovery |
|---------|----------|----------|
| AuditLog write fails | Login proceeds (non-blocking try-catch) | Next login retries audit |
| Rate limiter Map grows | prune() clears expired entries hourly | setInterval(prune, 3600000) |
| Provider health monitor has no data | Returns score 1.0 (healthy) | First failure starts tracking |
| All providers report "down" | Login page still shows all buttons | Ops sees degraded in /api/auth/health |

## Testing Strategy

| Component | Tests | Type |
|-----------|-------|------|
| AuthRateLimiter | 6 | Unit (allow/block/lockout/reset/prune/loopback) |
| ProviderHealthMonitor | 4 | Unit (success/failure/degraded/threshold) |
| Auth audit event shape | 2 | Unit (success/failed event format) |
| Session config | 2 | Unit (maxAge, cookie settings) |
| Provider health endpoint | 1 | Integration |

~15 new tests, ~150 lines of test code.

## File Impact

| File | Action | Est. Lines |
|------|--------|-----------|
| `packages/security/src/auth-rate-limit.ts` | Create | ~60 |
| `packages/security/src/__tests__/auth-rate-limit.test.ts` | Create | ~80 |
| `packages/security/src/provider-health.ts` | Create | ~45 |
| `packages/security/src/__tests__/provider-health.test.ts` | Create | ~50 |
| `packages/security/src/index.ts` | Modify | ~2 |
| `apps/dashboard/lib/auth.ts` | Modify | ~40 |
| `apps/dashboard/__tests__/auth.test.ts` | Modify | ~30 |
| `apps/dashboard/app/api/auth/health/route.ts` | Create | ~15 |

No new services, no new dependencies, no new Docker containers.
