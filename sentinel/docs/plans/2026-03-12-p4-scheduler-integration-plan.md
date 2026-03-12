# P4 Self-Scan Scheduler Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the existing scheduler scaffold into a production-grade enterprise system with active-passive HA, per-org scheduling, full scan lifecycle tracking, tiered circuit breakers, and dual-layer audit.

**Architecture:** Refactor monolithic `scheduler.ts` into a Plugin/Registry pattern under `apps/api/src/scheduler/`. Each cron job becomes a `SchedulerJob` class. A `LeaderLease` ensures only one scheduler instance is active (Redis SETNX + PG advisory lock for DB jobs). A `CircuitBreakerManager` prevents cascading failures with per-dependency tiered breakers. A `ScanLifecycleTracker` tracks trigger-to-completion. An `AuditLayer` dual-writes to Redis stream and PostgreSQL.

**Tech Stack:** TypeScript, node-cron, ioredis, cron-parser, @sentinel/events (EventBus), @sentinel/db (Prisma), @sentinel/audit (AuditLog), @sentinel/telemetry (pino logger), @sentinel/security (SELF_SCAN_CONFIG), @sentinel/compliance (frameworks, evidence chain)

---

## Phase 1: Core Infrastructure (Tasks 1-4)

### Task 1: Create Scheduler Types and Job Interface

**Files:**
- Create: `apps/api/src/scheduler/types.ts`
- Test: `apps/api/src/scheduler/__tests__/types.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/scheduler/__tests__/types.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import type { SchedulerJob, JobContext, JobTier } from "../types.js";

describe("scheduler types", () => {
  test("SchedulerJob interface requires name, schedule, tier, dependencies, execute", () => {
    const job: SchedulerJob = {
      name: "test-job",
      schedule: "0 * * * *",
      tier: "critical",
      dependencies: ["redis"],
      execute: async (_ctx: JobContext) => {},
    };
    expect(job.name).toBe("test-job");
    expect(job.tier).toBe("critical");
    expect(job.dependencies).toEqual(["redis"]);
  });

  test("JobTier accepts critical and non-critical", () => {
    const t1: JobTier = "critical";
    const t2: JobTier = "non-critical";
    expect(t1).toBe("critical");
    expect(t2).toBe("non-critical");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/types.test.ts`
Expected: FAIL (module not found)

**Step 3: Create the types module**

Create `apps/api/src/scheduler/types.ts`:

```typescript
import type { Redis } from "ioredis";
import type { EventBus } from "@sentinel/events";
import type { Logger } from "pino";

export type JobTier = "critical" | "non-critical";
export type Dependency = "redis" | "postgres";

export interface JobContext {
  eventBus: EventBus;
  db: any; // Prisma client
  redis: Redis;
  metrics: SchedulerMetrics;
  audit: AuditLayer;
  logger: Logger;
}

export interface SchedulerJob {
  name: string;
  schedule: string;
  tier: JobTier;
  dependencies: Dependency[];
  execute(ctx: JobContext): Promise<void>;
}

export interface SchedulerMetrics {
  registerSchedule(type: string, cronExpr: string): void;
  recordTrigger(type: string): void;
  recordError(type: string): void;
  getTriggerCount(type: string): number;
  getErrorCount(type: string): number;
  toPrometheus(): string;
  getHealthStatus(): {
    status: string;
    uptime: number;
    lastTrigger: Record<string, string>;
    nextScheduled: Record<string, string>;
  };
}

export interface AuditLayer {
  log(entry: SchedulerAuditEntry): Promise<void>;
  recent(limit?: number): Promise<SchedulerAuditEntry[]>;
}

export interface SchedulerAuditEntry {
  jobName: string;
  action: "triggered" | "completed" | "failed" | "skipped" | "circuit_open";
  timestamp: string;
  detail?: Record<string, unknown>;
}

export interface LeaderLease {
  acquire(): Promise<boolean>;
  renew(): Promise<boolean>;
  release(): Promise<void>;
  isLeader(): boolean;
}

export interface CircuitBreakerState {
  state: "closed" | "open" | "half-open";
  failures: number;
  lastFailure: number | null;
  lastSuccess: number | null;
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/scheduler/types.ts apps/api/src/scheduler/__tests__/types.test.ts
git commit -m "feat(scheduler): add SchedulerJob interface and core types"
```

---

### Task 2: Implement Leader Lease (Redis SETNX)

**Files:**
- Create: `apps/api/src/scheduler/leader-lease.ts`
- Test: `apps/api/src/scheduler/__tests__/leader-lease.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/scheduler/__tests__/leader-lease.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/leader-lease.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement leader lease**

Create `apps/api/src/scheduler/leader-lease.ts`:

```typescript
import type { Redis } from "ioredis";
import type { LeaderLease } from "./types.js";

export interface LeaderLeaseOptions {
  key: string;
  ttlMs: number;
  instanceId: string;
}

// Lua script: renew only if we own the lock
const RENEW_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

// Lua script: release only if we own the lock
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export class RedisLeaderLease implements LeaderLease {
  private _isLeader = false;
  private readonly key: string;
  private readonly ttlMs: number;
  private readonly instanceId: string;

  constructor(private redis: Redis, options: LeaderLeaseOptions) {
    this.key = options.key;
    this.ttlMs = options.ttlMs;
    this.instanceId = options.instanceId;
  }

  async acquire(): Promise<boolean> {
    const result = await this.redis.set(
      this.key,
      this.instanceId,
      "PX", this.ttlMs,
      "NX",
    );
    this._isLeader = result === "OK";
    return this._isLeader;
  }

  async renew(): Promise<boolean> {
    const result = await this.redis.eval(
      RENEW_SCRIPT,
      1,
      this.key,
      this.instanceId,
      String(this.ttlMs),
    );
    this._isLeader = result === 1;
    return this._isLeader;
  }

  async release(): Promise<void> {
    await this.redis.eval(
      RELEASE_SCRIPT,
      1,
      this.key,
      this.instanceId,
    );
    this._isLeader = false;
  }

  isLeader(): boolean {
    return this._isLeader;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/leader-lease.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/scheduler/leader-lease.ts apps/api/src/scheduler/__tests__/leader-lease.test.ts
git commit -m "feat(scheduler): add Redis SETNX leader lease with Lua renew/release"
```

---

### Task 3: Implement Circuit Breaker

**Files:**
- Create: `apps/api/src/scheduler/circuit-breaker.ts`
- Test: `apps/api/src/scheduler/__tests__/circuit-breaker.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/scheduler/__tests__/circuit-breaker.test.ts`:

```typescript
import { describe, test, expect, beforeEach, vi } from "vitest";
import { CircuitBreakerManager } from "../circuit-breaker.js";

describe("CircuitBreakerManager", () => {
  let cb: CircuitBreakerManager;

  beforeEach(() => {
    cb = new CircuitBreakerManager();
  });

  test("starts in closed state", () => {
    expect(cb.canExecute("redis", "critical")).toBe(true);
    expect(cb.getState("redis")).toBe("closed");
  });

  test("opens after non-critical failure threshold (3)", () => {
    cb.recordFailure("redis");
    cb.recordFailure("redis");
    expect(cb.canExecute("redis", "non-critical")).toBe(true);
    cb.recordFailure("redis");
    expect(cb.canExecute("redis", "non-critical")).toBe(false);
    expect(cb.getState("redis")).toBe("open");
  });

  test("critical jobs tolerate more failures (5)", () => {
    for (let i = 0; i < 4; i++) cb.recordFailure("postgres");
    expect(cb.canExecute("postgres", "critical")).toBe(true);
    cb.recordFailure("postgres");
    expect(cb.canExecute("postgres", "critical")).toBe(false);
  });

  test("success resets failure count", () => {
    cb.recordFailure("redis");
    cb.recordFailure("redis");
    cb.recordSuccess("redis");
    expect(cb.canExecute("redis", "non-critical")).toBe(true);
    expect(cb.getState("redis")).toBe("closed");
  });

  test("transitions to half-open after cooldown", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) cb.recordFailure("redis");
    expect(cb.getState("redis")).toBe("open");

    // Advance past critical cooldown (30s)
    vi.advanceTimersByTime(31000);
    expect(cb.canExecute("redis", "critical")).toBe(true);
    expect(cb.getState("redis")).toBe("half-open");
    vi.useRealTimers();
  });

  test("half-open closes on success", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) cb.recordFailure("redis");
    vi.advanceTimersByTime(31000);
    cb.canExecute("redis", "critical"); // transition to half-open
    cb.recordSuccess("redis");
    expect(cb.getState("redis")).toBe("closed");
    vi.useRealTimers();
  });

  test("half-open reopens on failure", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) cb.recordFailure("redis");
    vi.advanceTimersByTime(31000);
    cb.canExecute("redis", "critical"); // transition to half-open
    cb.recordFailure("redis");
    expect(cb.getState("redis")).toBe("open");
    vi.useRealTimers();
  });

  test("getAllStates returns all tracked dependencies", () => {
    cb.recordFailure("redis");
    cb.recordFailure("postgres");
    const states = cb.getAllStates();
    expect(states).toHaveProperty("redis");
    expect(states).toHaveProperty("postgres");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/circuit-breaker.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement circuit breaker**

Create `apps/api/src/scheduler/circuit-breaker.ts`:

```typescript
import type { CircuitBreakerState, Dependency, JobTier } from "./types.js";

// Tier-specific thresholds
const THRESHOLDS: Record<JobTier, { failureThreshold: number; cooldownMs: number }> = {
  "critical":     { failureThreshold: 5, cooldownMs: 30_000 },
  "non-critical": { failureThreshold: 3, cooldownMs: 60_000 },
};

export class CircuitBreakerManager {
  private circuits = new Map<string, CircuitBreakerState>();

  private getOrCreate(dep: string): CircuitBreakerState {
    let circuit = this.circuits.get(dep);
    if (!circuit) {
      circuit = { state: "closed", failures: 0, lastFailure: null, lastSuccess: null };
      this.circuits.set(dep, circuit);
    }
    return circuit;
  }

  canExecute(dep: string, tier: JobTier): boolean {
    const circuit = this.getOrCreate(dep);
    const { failureThreshold, cooldownMs } = THRESHOLDS[tier];

    if (circuit.state === "closed") {
      return circuit.failures < failureThreshold;
    }

    if (circuit.state === "open") {
      const elapsed = Date.now() - (circuit.lastFailure ?? 0);
      if (elapsed >= cooldownMs) {
        circuit.state = "half-open";
        return true;
      }
      return false;
    }

    // half-open: allow one probe
    return true;
  }

  recordSuccess(dep: string): void {
    const circuit = this.getOrCreate(dep);
    circuit.failures = 0;
    circuit.lastSuccess = Date.now();
    circuit.state = "closed";
  }

  recordFailure(dep: string): void {
    const circuit = this.getOrCreate(dep);
    circuit.failures++;
    circuit.lastFailure = Date.now();

    if (circuit.state === "half-open") {
      circuit.state = "open";
      return;
    }

    // Check against the higher threshold (critical) to decide open
    // Individual canExecute checks enforce per-tier thresholds
    const maxThreshold = THRESHOLDS["critical"].failureThreshold;
    if (circuit.failures >= maxThreshold) {
      circuit.state = "open";
    }
  }

  getState(dep: string): CircuitBreakerState["state"] {
    return this.getOrCreate(dep).state;
  }

  getAllStates(): Record<string, CircuitBreakerState> {
    const result: Record<string, CircuitBreakerState> = {};
    for (const [dep, state] of this.circuits) {
      result[dep] = { ...state };
    }
    return result;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/circuit-breaker.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/scheduler/circuit-breaker.ts apps/api/src/scheduler/__tests__/circuit-breaker.test.ts
git commit -m "feat(scheduler): add tiered circuit breaker with degraded mode"
```

---

### Task 4: Implement Audit Layer (Dual Redis + PostgreSQL)

**Files:**
- Create: `apps/api/src/scheduler/audit-layer.ts`
- Test: `apps/api/src/scheduler/__tests__/audit-layer.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/scheduler/__tests__/audit-layer.test.ts`:

```typescript
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
      return streams.map((s, i) => [
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
    // Should not throw
    await layer.log(entry);
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
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/audit-layer.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement audit layer**

Create `apps/api/src/scheduler/audit-layer.ts`:

```typescript
import type { Redis } from "ioredis";
import type { AuditLog } from "@sentinel/audit";
import type { AuditLayer, SchedulerAuditEntry } from "./types.js";
import { createLogger } from "@sentinel/telemetry";

const logger = createLogger({ name: "scheduler-audit" });
const STREAM_KEY = "sentinel.scheduler.audit";
const STREAM_TTL = 86400; // 24 hours

export class DualAuditLayer implements AuditLayer {
  constructor(
    private redis: Redis,
    private auditLog: AuditLog | null,
  ) {}

  async log(entry: SchedulerAuditEntry): Promise<void> {
    // 1. Always write to Redis stream (real-time ops visibility)
    try {
      await this.redis.xadd(
        STREAM_KEY,
        "*",
        "data",
        JSON.stringify(entry),
      );
      // Set TTL on the stream key (refreshed each write)
      await this.redis.expire(STREAM_KEY, STREAM_TTL);
    } catch (err) {
      logger.warn({ err, entry }, "Failed to write scheduler audit to Redis");
    }

    // 2. Write to PostgreSQL audit log (persistent, compliance-grade)
    if (this.auditLog) {
      try {
        await this.auditLog.append("system", {
          actor: { type: "system", id: "scheduler", name: "sentinel-scheduler" },
          action: `scheduler.${entry.action}`,
          resource: { type: "scheduler-job", id: entry.jobName },
          detail: {
            ...entry.detail,
            timestamp: entry.timestamp,
          },
        });
      } catch (err) {
        logger.warn({ err, entry }, "Failed to write scheduler audit to PostgreSQL");
      }
    }
  }

  async recent(limit: number = 50): Promise<SchedulerAuditEntry[]> {
    try {
      const results = await this.redis.xrevrange(
        STREAM_KEY,
        "+",
        "-",
        "COUNT",
        limit,
      );
      return results.map(([_id, fields]: [string, string[]]) => {
        const dataIdx = fields.indexOf("data");
        if (dataIdx === -1 || dataIdx + 1 >= fields.length) {
          return null;
        }
        return JSON.parse(fields[dataIdx + 1]) as SchedulerAuditEntry;
      }).filter(Boolean) as SchedulerAuditEntry[];
    } catch (err) {
      logger.warn({ err }, "Failed to read scheduler audit from Redis");
      return [];
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/audit-layer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/scheduler/audit-layer.ts apps/api/src/scheduler/__tests__/audit-layer.test.ts
git commit -m "feat(scheduler): add dual Redis+PostgreSQL audit layer"
```

---

## Phase 2: Job Implementations (Tasks 5-8)

### Task 5: Implement SelfScanJob and CVERescanJob

**Files:**
- Create: `apps/api/src/scheduler/jobs/self-scan.ts`
- Create: `apps/api/src/scheduler/jobs/cve-rescan.ts`
- Test: `apps/api/src/scheduler/__tests__/jobs-scan.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/scheduler/__tests__/jobs-scan.test.ts`:

```typescript
import { describe, test, expect, vi } from "vitest";
import { SelfScanJob } from "../jobs/self-scan.js";
import { CVERescanJob } from "../jobs/cve-rescan.js";
import type { JobContext } from "../types.js";

function createMockContext(): JobContext {
  return {
    eventBus: { publish: vi.fn(async () => "msg-1") } as any,
    db: {} as any,
    redis: {} as any,
    metrics: { recordTrigger: vi.fn(), recordError: vi.fn() } as any,
    audit: { log: vi.fn(async () => {}) } as any,
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any,
  };
}

describe("SelfScanJob", () => {
  test("has correct metadata", () => {
    const job = new SelfScanJob();
    expect(job.name).toBe("self-scan");
    expect(job.tier).toBe("critical");
    expect(job.dependencies).toEqual(["redis"]);
    expect(job.schedule).toBe("0 2 * * *");
  });

  test("publishes scan event to sentinel.diffs", async () => {
    const job = new SelfScanJob();
    const ctx = createMockContext();
    await job.execute(ctx);
    expect(ctx.eventBus.publish).toHaveBeenCalledWith(
      "sentinel.diffs",
      expect.objectContaining({
        triggeredBy: "scheduler",
      }),
    );
  });

  test("scan payload includes selfScan flag and targets", async () => {
    const job = new SelfScanJob();
    const ctx = createMockContext();
    await job.execute(ctx);
    const payload = (ctx.eventBus.publish as any).mock.calls[0][1];
    expect(payload.payload.selfScan).toBe(true);
    expect(payload.payload.targets.length).toBeGreaterThan(0);
    expect(payload.payload.author).toBe("sentinel-scheduler");
  });
});

describe("CVERescanJob", () => {
  test("has correct metadata", () => {
    const job = new CVERescanJob();
    expect(job.name).toBe("cve-rescan");
    expect(job.tier).toBe("critical");
    expect(job.schedule).toBe("0 3 * * *");
  });

  test("publishes scan event to sentinel.diffs", async () => {
    const job = new CVERescanJob();
    const ctx = createMockContext();
    await job.execute(ctx);
    expect(ctx.eventBus.publish).toHaveBeenCalledWith(
      "sentinel.diffs",
      expect.objectContaining({
        triggeredBy: "scheduler",
      }),
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/jobs-scan.test.ts`
Expected: FAIL

**Step 3: Implement SelfScanJob**

Create `apps/api/src/scheduler/jobs/self-scan.ts`:

```typescript
import { SELF_SCAN_CONFIG } from "@sentinel/security";
import type { SchedulerJob, JobContext } from "../types.js";

export class SelfScanJob implements SchedulerJob {
  name = "self-scan" as const;
  schedule = SELF_SCAN_CONFIG.schedule;
  tier = "critical" as const;
  dependencies = ["redis"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const scanId = `self-scan-${Date.now()}`;
    const scanPayload = {
      projectId: "self-scan",
      commitHash: `scheduled-${Date.now()}`,
      branch: "main",
      author: "sentinel-scheduler",
      timestamp: new Date().toISOString(),
      files: [],
      toolHints: { tool: "sentinel-self-scan", markers: [] },
      scanConfig: {
        securityLevel: "strict" as const,
        licensePolicy: "default",
        qualityThreshold: 80,
      },
      selfScan: true,
      targets: SELF_SCAN_CONFIG.targets,
      policyPath: SELF_SCAN_CONFIG.policyPath,
    };

    await ctx.eventBus.publish("sentinel.diffs", {
      scanId,
      payload: scanPayload,
      submittedAt: new Date().toISOString(),
      triggeredBy: "scheduler",
    });

    ctx.logger.info({ scanId, targets: SELF_SCAN_CONFIG.targets }, "Self-scan triggered");
  }
}
```

**Step 4: Implement CVERescanJob**

Create `apps/api/src/scheduler/jobs/cve-rescan.ts`:

```typescript
import { SELF_SCAN_CONFIG } from "@sentinel/security";
import type { SchedulerJob, JobContext } from "../types.js";

export class CVERescanJob implements SchedulerJob {
  name = "cve-rescan" as const;
  schedule = SELF_SCAN_CONFIG.cveRescanSchedule;
  tier = "critical" as const;
  dependencies = ["redis"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const scanId = `cve-rescan-${Date.now()}`;
    await ctx.eventBus.publish("sentinel.diffs", {
      scanId,
      payload: {
        projectId: "self-scan",
        commitHash: `cve-rescan-${Date.now()}`,
        branch: "main",
        author: "sentinel-scheduler",
        timestamp: new Date().toISOString(),
        files: [],
        toolHints: { tool: "sentinel-cve-rescan", markers: [] },
        scanConfig: {
          securityLevel: "strict" as const,
          licensePolicy: "default",
          qualityThreshold: 80,
        },
        selfScan: true,
        targets: SELF_SCAN_CONFIG.targets,
        policyPath: SELF_SCAN_CONFIG.policyPath,
      },
      submittedAt: new Date().toISOString(),
      triggeredBy: "scheduler",
    });

    ctx.logger.info({ scanId }, "CVE rescan triggered");
  }
}
```

**Step 5: Run tests**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/jobs-scan.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/src/scheduler/jobs/self-scan.ts apps/api/src/scheduler/jobs/cve-rescan.ts apps/api/src/scheduler/__tests__/jobs-scan.test.ts
git commit -m "feat(scheduler): add SelfScanJob and CVERescanJob implementations"
```

---

### Task 6: Implement RetentionJob and HealthCheckJob

**Files:**
- Create: `apps/api/src/scheduler/jobs/retention.ts`
- Create: `apps/api/src/scheduler/jobs/health-check.ts`
- Test: `apps/api/src/scheduler/__tests__/jobs-ops.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/scheduler/__tests__/jobs-ops.test.ts`:

```typescript
import { describe, test, expect, vi } from "vitest";
import { RetentionJob } from "../jobs/retention.js";
import { HealthCheckJob } from "../jobs/health-check.js";
import type { JobContext } from "../types.js";

function createMockContext(overrides: Record<string, unknown> = {}): JobContext {
  return {
    eventBus: { publish: vi.fn(async () => "msg-1") } as any,
    db: {
      organization: {
        findMany: vi.fn(async () => [
          { id: "org-1", settings: { retentionDays: 90 } },
        ]),
      },
      ...overrides,
    } as any,
    redis: {} as any,
    metrics: { recordTrigger: vi.fn(), recordError: vi.fn() } as any,
    audit: { log: vi.fn(async () => {}) } as any,
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any,
  };
}

describe("RetentionJob", () => {
  test("has correct metadata", () => {
    const job = new RetentionJob();
    expect(job.name).toBe("retention");
    expect(job.tier).toBe("non-critical");
    expect(job.dependencies).toContain("postgres");
    expect(job.schedule).toBe("0 4 * * *");
  });

  test("runs retention cleanup per org", async () => {
    const job = new RetentionJob();
    const ctx = createMockContext();
    // Mock the runRetentionCleanup import — the job should call it
    await job.execute(ctx);
    expect(ctx.db.organization.findMany).toHaveBeenCalled();
  });
});

describe("HealthCheckJob", () => {
  test("has correct metadata", () => {
    const job = new HealthCheckJob();
    expect(job.name).toBe("health-check");
    expect(job.tier).toBe("non-critical");
    expect(job.dependencies).toEqual(["redis"]);
    expect(job.schedule).toBe("*/5 * * * *");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/jobs-ops.test.ts`
Expected: FAIL

**Step 3: Implement RetentionJob**

Create `apps/api/src/scheduler/jobs/retention.ts`:

```typescript
import { runRetentionCleanup, DEFAULT_RETENTION_DAYS } from "@sentinel/security";
import type { SchedulerJob, JobContext } from "../types.js";

export class RetentionJob implements SchedulerJob {
  name = "retention" as const;
  schedule = "0 4 * * *";
  tier = "non-critical" as const;
  dependencies = ["redis", "postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const orgs = await ctx.db.organization.findMany({
      select: { id: true, settings: true },
    });

    for (const org of orgs) {
      const retentionDays = (org.settings as any)?.retentionDays ?? DEFAULT_RETENTION_DAYS;
      const result = await runRetentionCleanup(ctx.db, retentionDays, org.id);
      if (result.deletedFindings + result.deletedAgentResults + result.deletedScans > 0) {
        ctx.logger.info({ orgId: org.id, retentionDays, ...result }, "Org retention cleanup completed");
      }
    }
    ctx.logger.info("Data retention cleanup completed for all orgs");
  }
}
```

**Step 4: Implement HealthCheckJob**

Create `apps/api/src/scheduler/jobs/health-check.ts`:

```typescript
import type { SchedulerJob, JobContext } from "../types.js";

const SERVICE_HEALTH_ENDPOINTS = [
  { name: "assessor-worker", url: `http://localhost:${process.env.WORKER_HEALTH_PORT ?? "9092"}/health` },
  { name: "report-worker", url: `http://localhost:${process.env.REPORT_WORKER_PORT ?? "9094"}/health` },
  { name: "notification-worker", url: `http://localhost:${process.env.NOTIFICATION_WORKER_PORT ?? "9095"}/health` },
];

export class HealthCheckJob implements SchedulerJob {
  name = "health-check" as const;
  schedule = "*/5 * * * *";
  tier = "non-critical" as const;
  dependencies = ["redis"] as const;

  async execute(ctx: JobContext): Promise<void> {
    for (const svc of SERVICE_HEALTH_ENDPOINTS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(svc.url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) {
          ctx.logger.warn({ service: svc.name, status: res.status }, "Service health check returned non-OK");
          await ctx.eventBus.publish("sentinel.notifications", {
            id: `evt-health-${svc.name}-${Date.now()}`,
            orgId: "system",
            topic: "system.health_degraded",
            payload: { service: svc.name, status: res.status, reason: "non-ok response" },
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        ctx.logger.warn({ service: svc.name, err }, "Service health check failed");
        await ctx.eventBus.publish("sentinel.notifications", {
          id: `evt-health-${svc.name}-${Date.now()}`,
          orgId: "system",
          topic: "system.health_degraded",
          payload: { service: svc.name, reason: String(err) },
          timestamp: new Date().toISOString(),
        });
      }
    }
  }
}
```

**Step 5: Run tests**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/jobs-ops.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/src/scheduler/jobs/retention.ts apps/api/src/scheduler/jobs/health-check.ts apps/api/src/scheduler/__tests__/jobs-ops.test.ts
git commit -m "feat(scheduler): add RetentionJob and HealthCheckJob"
```

---

### Task 7: Implement ComplianceSnapJob, TrendsRefreshJob, EvidenceCheckJob

**Files:**
- Create: `apps/api/src/scheduler/jobs/compliance-snapshot.ts`
- Create: `apps/api/src/scheduler/jobs/trends-refresh.ts`
- Create: `apps/api/src/scheduler/jobs/evidence-check.ts`
- Test: `apps/api/src/scheduler/__tests__/jobs-compliance.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/scheduler/__tests__/jobs-compliance.test.ts`:

```typescript
import { describe, test, expect, vi } from "vitest";
import { ComplianceSnapshotJob } from "../jobs/compliance-snapshot.js";
import { TrendsRefreshJob } from "../jobs/trends-refresh.js";
import { EvidenceCheckJob } from "../jobs/evidence-check.js";
import type { JobContext } from "../types.js";

function createMockContext(): JobContext {
  return {
    eventBus: { publish: vi.fn(async () => "msg-1") } as any,
    db: {
      organization: { findMany: vi.fn(async () => []) },
      finding: { findMany: vi.fn(async () => []) },
      complianceSnapshot: { upsert: vi.fn(), findFirst: vi.fn(async () => null) },
      complianceAssessment: { create: vi.fn() },
      evidenceRecord: { findMany: vi.fn(async () => []) },
      $executeRawUnsafe: vi.fn(async () => {}),
    } as any,
    redis: {} as any,
    metrics: { recordTrigger: vi.fn(), recordError: vi.fn() } as any,
    audit: { log: vi.fn(async () => {}) } as any,
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any,
  };
}

describe("ComplianceSnapshotJob", () => {
  test("has correct metadata", () => {
    const job = new ComplianceSnapshotJob();
    expect(job.name).toBe("compliance-snapshot");
    expect(job.tier).toBe("critical");
    expect(job.dependencies).toContain("postgres");
    expect(job.schedule).toBe("0 5 * * *");
  });

  test("queries organizations and generates snapshots", async () => {
    const job = new ComplianceSnapshotJob();
    const ctx = createMockContext();
    await job.execute(ctx);
    expect(ctx.db.organization.findMany).toHaveBeenCalled();
  });
});

describe("TrendsRefreshJob", () => {
  test("has correct metadata", () => {
    const job = new TrendsRefreshJob();
    expect(job.name).toBe("trends-refresh");
    expect(job.tier).toBe("non-critical");
    expect(job.schedule).toBe("5 5 * * *");
  });

  test("refreshes materialized view", async () => {
    const job = new TrendsRefreshJob();
    const ctx = createMockContext();
    await job.execute(ctx);
    expect(ctx.db.$executeRawUnsafe).toHaveBeenCalledWith(
      "REFRESH MATERIALIZED VIEW CONCURRENTLY compliance_trends",
    );
  });
});

describe("EvidenceCheckJob", () => {
  test("has correct metadata", () => {
    const job = new EvidenceCheckJob();
    expect(job.name).toBe("evidence-check");
    expect(job.tier).toBe("critical");
    expect(job.schedule).toBe("30 5 * * *");
  });

  test("queries organizations for evidence verification", async () => {
    const job = new EvidenceCheckJob();
    const ctx = createMockContext();
    await job.execute(ctx);
    expect(ctx.db.organization.findMany).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/jobs-compliance.test.ts`
Expected: FAIL

**Step 3: Implement ComplianceSnapshotJob**

Create `apps/api/src/scheduler/jobs/compliance-snapshot.ts`:

```typescript
import { BUILT_IN_FRAMEWORKS, scoreFramework, type FindingInput } from "@sentinel/compliance";
import type { SchedulerJob, JobContext } from "../types.js";

export class ComplianceSnapshotJob implements SchedulerJob {
  name = "compliance-snapshot" as const;
  schedule = "0 5 * * *";
  tier = "critical" as const;
  dependencies = ["redis", "postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const orgs = await ctx.db.organization.findMany({ select: { id: true } });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    let generated = 0;

    for (const org of orgs) {
      const findings = await ctx.db.finding.findMany({
        where: { orgId: org.id, suppressed: false },
        orderBy: { createdAt: "desc" },
        take: 5000,
      });
      const inputs: FindingInput[] = findings.map((f: any) => ({
        id: f.id, agentName: f.agentName, severity: f.severity,
        category: f.category, suppressed: f.suppressed,
      }));

      for (const fw of BUILT_IN_FRAMEWORKS) {
        const result = scoreFramework(fw.controls, inputs);
        await ctx.db.complianceSnapshot.upsert({
          where: { orgId_frameworkId_date: { orgId: org.id, frameworkId: fw.slug, date: today } },
          update: { score: result.score, controlBreakdown: result.controlScores },
          create: { orgId: org.id, frameworkId: fw.slug, date: today, score: result.score, controlBreakdown: result.controlScores },
        });
        await ctx.db.complianceAssessment.create({
          data: { orgId: org.id, frameworkId: fw.slug, score: result.score, verdict: result.verdict, controlScores: result.controlScores },
        });

        await ctx.eventBus.publish("sentinel.notifications", {
          id: `evt-${org.id}-${fw.slug}-assessed`,
          orgId: org.id,
          topic: "compliance.assessed",
          payload: { frameworkSlug: fw.slug, score: result.score, verdict: result.verdict },
          timestamp: new Date().toISOString(),
        });

        // Check for compliance degradation
        const prevSnapshot = await ctx.db.complianceSnapshot.findFirst({
          where: { orgId: org.id, frameworkId: fw.slug, date: { lt: today } },
          orderBy: { date: "desc" },
        });
        if (prevSnapshot && result.score < prevSnapshot.score) {
          await ctx.eventBus.publish("sentinel.notifications", {
            id: `evt-${org.id}-${fw.slug}-degraded`,
            orgId: org.id,
            topic: "compliance.degraded",
            payload: { frameworkSlug: fw.slug, previousScore: prevSnapshot.score, newScore: result.score },
            timestamp: new Date().toISOString(),
          });
        }
        generated++;
      }
    }
    ctx.logger.info({ generated }, "Compliance snapshots generated");
  }
}
```

**Step 4: Implement TrendsRefreshJob**

Create `apps/api/src/scheduler/jobs/trends-refresh.ts`:

```typescript
import type { SchedulerJob, JobContext } from "../types.js";

export class TrendsRefreshJob implements SchedulerJob {
  name = "trends-refresh" as const;
  schedule = "5 5 * * *";
  tier = "non-critical" as const;
  dependencies = ["postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    try {
      await ctx.db.$executeRawUnsafe("REFRESH MATERIALIZED VIEW CONCURRENTLY compliance_trends");
      ctx.logger.info("Compliance trends materialized view refreshed");
    } catch (err) {
      ctx.logger.warn({ err }, "Failed to refresh compliance_trends view - may not exist yet");
    }
  }
}
```

**Step 5: Implement EvidenceCheckJob**

Create `apps/api/src/scheduler/jobs/evidence-check.ts`:

```typescript
import { verifyEvidenceChain } from "@sentinel/compliance";
import type { SchedulerJob, JobContext } from "../types.js";

export class EvidenceCheckJob implements SchedulerJob {
  name = "evidence-check" as const;
  schedule = "30 5 * * *";
  tier = "critical" as const;
  dependencies = ["redis", "postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const orgs = await ctx.db.organization.findMany({ select: { id: true } });
    let checked = 0;
    let failures = 0;

    for (const org of orgs) {
      const records = await ctx.db.evidenceRecord.findMany({
        where: { orgId: org.id },
        orderBy: { createdAt: "asc" },
      });
      if (records.length === 0) continue;

      const chain = records.map((r: any) => ({ data: r.data, hash: r.hash, prevHash: r.prevHash }));
      const result = verifyEvidenceChain(chain);
      checked++;
      if (!result.valid) {
        failures++;
        ctx.logger.error({ orgId: org.id, brokenAt: result.brokenAt }, "Evidence chain integrity failure");
        await ctx.eventBus.publish("sentinel.notifications", {
          id: `evt-${org.id}-chain-broken`,
          orgId: org.id,
          topic: "evidence.chain_broken",
          payload: { orgId: org.id, brokenAtIndex: result.brokenAt },
          timestamp: new Date().toISOString(),
        });
      }
    }
    ctx.logger.info({ checked, failures }, "Evidence chain integrity check completed");
  }
}
```

**Step 6: Run tests**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/jobs-compliance.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add apps/api/src/scheduler/jobs/compliance-snapshot.ts apps/api/src/scheduler/jobs/trends-refresh.ts apps/api/src/scheduler/jobs/evidence-check.ts apps/api/src/scheduler/__tests__/jobs-compliance.test.ts
git commit -m "feat(scheduler): add ComplianceSnapshot, TrendsRefresh, EvidenceCheck jobs"
```

---

### Task 8: Implement Scan Lifecycle Tracker

**Files:**
- Create: `apps/api/src/scheduler/lifecycle-tracker.ts`
- Test: `apps/api/src/scheduler/__tests__/lifecycle-tracker.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/scheduler/__tests__/lifecycle-tracker.test.ts`:

```typescript
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
    del: vi.fn(async (key: string) => {
      hashes.delete(key);
      return 1;
    }),
    keys: vi.fn(async (pattern: string) => {
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

  test("recordTrigger stores pending state in Redis hash", async () => {
    await tracker.recordTrigger("scan-1", "self-scan");
    expect(redis.hset).toHaveBeenCalledWith(
      "sentinel.scan.lifecycle:scan-1",
      "status", "pending",
      "jobName", "self-scan",
      expect.any(String), expect.any(String), // triggeredAt
    );
  });

  test("recordCompletion updates status to completed", async () => {
    await tracker.recordTrigger("scan-1", "self-scan");
    await tracker.recordCompletion("scan-1");
    expect(redis.hset).toHaveBeenLastCalledWith(
      "sentinel.scan.lifecycle:scan-1",
      "status", "completed",
      expect.any(String), expect.any(String), // completedAt
    );
  });

  test("checkTimeouts returns scans pending longer than threshold", async () => {
    // Set up a scan that triggered 10 minutes ago
    const oldTime = new Date(Date.now() - 600_000).toISOString();
    redis.keys.mockResolvedValueOnce(["sentinel.scan.lifecycle:scan-old"]);
    redis.hgetall.mockResolvedValueOnce({
      status: "pending",
      triggeredAt: oldTime,
      jobName: "self-scan",
    });
    const timedOut = await tracker.checkTimeouts(300_000); // 5 min threshold
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
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/lifecycle-tracker.test.ts`
Expected: FAIL

**Step 3: Implement lifecycle tracker**

Create `apps/api/src/scheduler/lifecycle-tracker.ts`:

```typescript
import type { Redis } from "ioredis";
import { createLogger } from "@sentinel/telemetry";

const logger = createLogger({ name: "scan-lifecycle" });
const KEY_PREFIX = "sentinel.scan.lifecycle";
const LIFECYCLE_TTL = 3600; // 1 hour

export class ScanLifecycleTracker {
  constructor(private redis: Redis) {}

  async recordTrigger(scanId: string, jobName: string): Promise<void> {
    const key = `${KEY_PREFIX}:${scanId}`;
    await this.redis.hset(
      key,
      "status", "pending",
      "jobName", jobName,
      "triggeredAt", new Date().toISOString(),
    );
    await this.redis.expire(key, LIFECYCLE_TTL);
  }

  async recordCompletion(scanId: string): Promise<void> {
    const key = `${KEY_PREFIX}:${scanId}`;
    await this.redis.hset(
      key,
      "status", "completed",
      "completedAt", new Date().toISOString(),
    );
  }

  async checkTimeouts(timeoutMs: number = 300_000): Promise<string[]> {
    const timedOut: string[] = [];
    const keys = await this.redis.keys(`${KEY_PREFIX}:*`);

    for (const key of keys) {
      const data = await this.redis.hgetall(key);
      if (!data || data.status === "completed" || data.status === "timeout") {
        continue;
      }
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
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/lifecycle-tracker.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/scheduler/lifecycle-tracker.ts apps/api/src/scheduler/__tests__/lifecycle-tracker.test.ts
git commit -m "feat(scheduler): add scan lifecycle tracker with timeout detection"
```

---

## Phase 3: Orchestration (Tasks 9-11)

### Task 9: Implement OrgScheduleManager

**Files:**
- Create: `apps/api/src/scheduler/org-schedule-manager.ts`
- Test: `apps/api/src/scheduler/__tests__/org-schedule-manager.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/scheduler/__tests__/org-schedule-manager.test.ts`:

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";
import { OrgScheduleManager } from "../org-schedule-manager.js";

function createMockDb() {
  return {
    organization: {
      findMany: vi.fn(async () => [
        { id: "org-1", settings: { scanSchedule: "0 6 * * *" } },
        { id: "org-2", settings: {} },
      ]),
    },
  };
}

describe("OrgScheduleManager", () => {
  let db: ReturnType<typeof createMockDb>;
  let manager: OrgScheduleManager;

  beforeEach(() => {
    db = createMockDb();
    manager = new OrgScheduleManager(db as any, "0 2 * * *");
  });

  test("loadOverrides fetches org settings from DB", async () => {
    await manager.loadOverrides();
    expect(db.organization.findMany).toHaveBeenCalled();
  });

  test("getSchedule returns override for org with custom schedule", async () => {
    await manager.loadOverrides();
    expect(manager.getSchedule("org-1")).toBe("0 6 * * *");
  });

  test("getSchedule returns default for org without override", async () => {
    await manager.loadOverrides();
    expect(manager.getSchedule("org-2")).toBe("0 2 * * *");
  });

  test("getSchedule returns default for unknown org", async () => {
    await manager.loadOverrides();
    expect(manager.getSchedule("org-unknown")).toBe("0 2 * * *");
  });

  test("getActiveOverrides returns only orgs with custom schedules", async () => {
    await manager.loadOverrides();
    const overrides = manager.getActiveOverrides();
    expect(overrides).toEqual({ "org-1": "0 6 * * *" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/org-schedule-manager.test.ts`
Expected: FAIL

**Step 3: Implement OrgScheduleManager**

Create `apps/api/src/scheduler/org-schedule-manager.ts`:

```typescript
import { createLogger } from "@sentinel/telemetry";

const logger = createLogger({ name: "org-schedule-manager" });

export class OrgScheduleManager {
  private overrides = new Map<string, string>();

  constructor(
    private db: any,
    private defaultSchedule: string,
  ) {}

  async loadOverrides(): Promise<void> {
    try {
      const orgs = await this.db.organization.findMany({
        select: { id: true, settings: true },
      });

      const newOverrides = new Map<string, string>();
      for (const org of orgs) {
        const schedule = (org.settings as any)?.scanSchedule;
        if (schedule && typeof schedule === "string" && schedule.trim()) {
          newOverrides.set(org.id, schedule);
        }
      }

      this.overrides = newOverrides;
      logger.info({ count: newOverrides.size }, "Org schedule overrides loaded");
    } catch (err) {
      logger.warn({ err }, "Failed to load org schedule overrides");
    }
  }

  getSchedule(orgId: string): string {
    return this.overrides.get(orgId) ?? this.defaultSchedule;
  }

  getActiveOverrides(): Record<string, string> {
    return Object.fromEntries(this.overrides);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/org-schedule-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/scheduler/org-schedule-manager.ts apps/api/src/scheduler/__tests__/org-schedule-manager.test.ts
git commit -m "feat(scheduler): add OrgScheduleManager for per-org cron overrides"
```

---

### Task 10: Implement JobRegistry and SchedulerService

**Files:**
- Create: `apps/api/src/scheduler/job-registry.ts`
- Create: `apps/api/src/scheduler/index.ts`
- Test: `apps/api/src/scheduler/__tests__/job-registry.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/scheduler/__tests__/job-registry.test.ts`:

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";
import { JobRegistry } from "../job-registry.js";
import type { SchedulerJob, JobContext } from "../types.js";

function createTestJob(overrides: Partial<SchedulerJob> = {}): SchedulerJob {
  return {
    name: "test-job",
    schedule: "* * * * *",
    tier: "non-critical",
    dependencies: ["redis"],
    execute: vi.fn(async () => {}),
    ...overrides,
  };
}

function createMockContext(): JobContext {
  return {
    eventBus: { publish: vi.fn() } as any,
    db: {} as any,
    redis: {} as any,
    metrics: {
      registerSchedule: vi.fn(),
      recordTrigger: vi.fn(),
      recordError: vi.fn(),
      getTriggerCount: vi.fn(() => 0),
      getErrorCount: vi.fn(() => 0),
      toPrometheus: vi.fn(() => ""),
      getHealthStatus: vi.fn(() => ({ status: "ok", uptime: 0, lastTrigger: {}, nextScheduled: {} })),
    },
    audit: { log: vi.fn(async () => {}), recent: vi.fn(async () => []) } as any,
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any,
  };
}

describe("JobRegistry", () => {
  let registry: JobRegistry;

  beforeEach(() => {
    registry = new JobRegistry();
  });

  test("register adds job to registry", () => {
    const job = createTestJob();
    registry.register(job);
    expect(registry.getJobs()).toHaveLength(1);
    expect(registry.getJobs()[0].name).toBe("test-job");
  });

  test("register rejects duplicate job names", () => {
    const job1 = createTestJob({ name: "dup" });
    const job2 = createTestJob({ name: "dup" });
    registry.register(job1);
    expect(() => registry.register(job2)).toThrow("already registered");
  });

  test("executeJob calls job.execute with context", async () => {
    const job = createTestJob();
    registry.register(job);
    const ctx = createMockContext();
    await registry.executeJob("test-job", ctx);
    expect(job.execute).toHaveBeenCalledWith(ctx);
  });

  test("executeJob records trigger in audit and metrics on success", async () => {
    const job = createTestJob();
    registry.register(job);
    const ctx = createMockContext();
    await registry.executeJob("test-job", ctx);
    expect(ctx.metrics.recordTrigger).toHaveBeenCalledWith("test-job");
    expect(ctx.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ jobName: "test-job", action: "completed" }),
    );
  });

  test("executeJob records error in audit and metrics on failure", async () => {
    const failJob = createTestJob({
      execute: vi.fn(async () => { throw new Error("boom"); }),
    });
    registry.register(failJob);
    const ctx = createMockContext();
    await expect(registry.executeJob("test-job", ctx)).rejects.toThrow("boom");
    expect(ctx.metrics.recordError).toHaveBeenCalledWith("test-job");
    expect(ctx.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ jobName: "test-job", action: "failed" }),
    );
  });

  test("getJob returns undefined for unknown job", () => {
    expect(registry.getJob("nonexistent")).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/job-registry.test.ts`
Expected: FAIL

**Step 3: Implement JobRegistry**

Create `apps/api/src/scheduler/job-registry.ts`:

```typescript
import type { SchedulerJob, JobContext } from "./types.js";

export class JobRegistry {
  private jobs = new Map<string, SchedulerJob>();

  register(job: SchedulerJob): void {
    if (this.jobs.has(job.name)) {
      throw new Error(`Job "${job.name}" already registered`);
    }
    this.jobs.set(job.name, job);
  }

  getJob(name: string): SchedulerJob | undefined {
    return this.jobs.get(name);
  }

  getJobs(): SchedulerJob[] {
    return Array.from(this.jobs.values());
  }

  async executeJob(name: string, ctx: JobContext): Promise<void> {
    const job = this.jobs.get(name);
    if (!job) throw new Error(`Job "${name}" not found`);

    const start = Date.now();
    await ctx.audit.log({
      jobName: name,
      action: "triggered",
      timestamp: new Date().toISOString(),
    });

    try {
      await job.execute(ctx);
      const durationMs = Date.now() - start;
      ctx.metrics.recordTrigger(name);
      await ctx.audit.log({
        jobName: name,
        action: "completed",
        timestamp: new Date().toISOString(),
        detail: { durationMs },
      });
    } catch (err) {
      ctx.metrics.recordError(name);
      await ctx.audit.log({
        jobName: name,
        action: "failed",
        timestamp: new Date().toISOString(),
        detail: { error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/job-registry.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/scheduler/job-registry.ts apps/api/src/scheduler/__tests__/job-registry.test.ts
git commit -m "feat(scheduler): add JobRegistry with audit+metrics wiring"
```

---

### Task 11: Wire SchedulerService Entrypoint and Replace Old scheduler.ts

**Files:**
- Create: `apps/api/src/scheduler/index.ts`
- Modify: `apps/api/src/scheduler.ts` (replace with thin entrypoint)
- Modify: `apps/api/src/__tests__/scheduler.test.ts` (update imports)

**Step 1: Create SchedulerService entrypoint**

Create `apps/api/src/scheduler/index.ts`:

```typescript
import cron from "node-cron";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { EventBus } from "@sentinel/events";
import { getDb } from "@sentinel/db";
import { AuditLog } from "@sentinel/audit";
import { createLogger } from "@sentinel/telemetry";
import { SELF_SCAN_CONFIG, validateSelfScanConfig } from "@sentinel/security";
import { CronExpressionParser } from "cron-parser";

import type { SchedulerJob, JobContext, SchedulerMetrics as ISchedulerMetrics } from "./types.js";
import { RedisLeaderLease } from "./leader-lease.js";
import { CircuitBreakerManager } from "./circuit-breaker.js";
import { DualAuditLayer } from "./audit-layer.js";
import { ScanLifecycleTracker } from "./lifecycle-tracker.js";
import { OrgScheduleManager } from "./org-schedule-manager.js";
import { JobRegistry } from "./job-registry.js";

// Jobs
import { SelfScanJob } from "./jobs/self-scan.js";
import { CVERescanJob } from "./jobs/cve-rescan.js";
import { RetentionJob } from "./jobs/retention.js";
import { ComplianceSnapshotJob } from "./jobs/compliance-snapshot.js";
import { TrendsRefreshJob } from "./jobs/trends-refresh.js";
import { EvidenceCheckJob } from "./jobs/evidence-check.js";
import { HealthCheckJob } from "./jobs/health-check.js";

const logger = createLogger({ name: "sentinel-scheduler" });

// Re-export types and components for testing
export type { SchedulerJob, JobContext } from "./types.js";
export { RedisLeaderLease } from "./leader-lease.js";
export { CircuitBreakerManager } from "./circuit-breaker.js";
export { DualAuditLayer } from "./audit-layer.js";
export { ScanLifecycleTracker } from "./lifecycle-tracker.js";
export { OrgScheduleManager } from "./org-schedule-manager.js";
export { JobRegistry } from "./job-registry.js";

// --- SchedulerMetrics (moved from old scheduler.ts) ---

export class SchedulerMetrics implements ISchedulerMetrics {
  private triggers = new Map<string, number>();
  private errors = new Map<string, number>();
  private lastTrigger = new Map<string, number>();
  private schedules = new Map<string, string>();

  registerSchedule(type: string, cronExpr: string) {
    this.schedules.set(type, cronExpr);
  }

  getHealthStatus() {
    const lastTrigger: Record<string, string> = {};
    const nextScheduled: Record<string, string> = {};
    for (const [type, ts] of this.lastTrigger) {
      lastTrigger[type] = new Date(ts).toISOString();
    }
    for (const [type, expr] of this.schedules) {
      try {
        nextScheduled[type] = CronExpressionParser.parse(expr).next().toDate().toISOString();
      } catch { /* skip invalid */ }
    }
    return { status: "ok", uptime: process.uptime(), lastTrigger, nextScheduled };
  }

  recordTrigger(type: string) {
    this.triggers.set(type, (this.triggers.get(type) ?? 0) + 1);
    this.lastTrigger.set(type, Date.now());
  }

  recordError(type: string) {
    this.errors.set(type, (this.errors.get(type) ?? 0) + 1);
  }

  getTriggerCount(type: string): number {
    return this.triggers.get(type) ?? 0;
  }

  getErrorCount(type: string): number {
    return this.errors.get(type) ?? 0;
  }

  toPrometheus(): string {
    const lines: string[] = [];
    lines.push("# HELP sentinel_scheduler_triggers_total Total scheduler triggers");
    lines.push("# TYPE sentinel_scheduler_triggers_total counter");
    for (const [type, count] of this.triggers) {
      lines.push(`sentinel_scheduler_triggers_total{type="${type}"} ${count}`);
    }
    lines.push("# HELP sentinel_scheduler_errors_total Total scheduler errors");
    lines.push("# TYPE sentinel_scheduler_errors_total counter");
    for (const [type, count] of this.errors) {
      lines.push(`sentinel_scheduler_errors_total{type="${type}"} ${count}`);
    }
    lines.push("# HELP sentinel_scheduler_last_trigger_timestamp Last trigger time");
    lines.push("# TYPE sentinel_scheduler_last_trigger_timestamp gauge");
    for (const [type, ts] of this.lastTrigger) {
      lines.push(`sentinel_scheduler_last_trigger_timestamp{type="${type}"} ${ts / 1000}`);
    }
    return lines.join("\n") + "\n";
  }
}

// --- Health Server ---

export function createHealthServer(metrics: SchedulerMetrics, port: number, extras?: { circuitBreaker?: CircuitBreakerManager; lease?: RedisLeaderLease }): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      const health = metrics.getHealthStatus();
      const body: Record<string, unknown> = { ...health };
      if (extras?.lease) body.isLeader = extras.lease.isLeader();
      if (extras?.circuitBreaker) body.circuits = extras.circuitBreaker.getAllStates();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    } else if (req.url === "/metrics") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(metrics.toPrometheus());
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(port);
  return server;
}

// --- Config (re-exported for backwards compat with tests) ---

export interface SchedulerConfig {
  schedule: string;
  cveRescanSchedule: string;
  targets: string[];
  policyPath: string;
  notifyOnFailure: boolean;
  cveRescanEnabled: boolean;
  enabled: boolean;
}

export const RETENTION_SCHEDULE = "0 4 * * *";
export const COMPLIANCE_SNAPSHOT_SCHEDULE = "0 5 * * *";
export const HEALTH_CHECK_SCHEDULE = "*/5 * * * *";

export function buildSchedulerConfig(): SchedulerConfig {
  const enabled = process.env.SELF_SCAN_ENABLED !== "false";
  return { ...SELF_SCAN_CONFIG, enabled };
}

export function shouldTriggerScan(config: SchedulerConfig): boolean {
  if (!config.enabled) return false;
  return validateSelfScanConfig(config).valid;
}

// --- Main Entrypoint ---

export async function startScheduler(): Promise<void> {
  const config = buildSchedulerConfig();
  const instanceId = `scheduler-${randomUUID().slice(0, 8)}`;

  // Infrastructure
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const eventBus = new EventBus(redis);
  const db = getDb();
  const metrics = new SchedulerMetrics();
  const circuitBreaker = new CircuitBreakerManager();
  const lifecycleTracker = new ScanLifecycleTracker(redis);
  const orgManager = new OrgScheduleManager(db, config.schedule);

  // Audit layer (PG audit log may not be available immediately)
  let auditLog: AuditLog | null = null;
  try {
    auditLog = new AuditLog(db.auditEvent);
  } catch {
    logger.warn("AuditLog store not available, using Redis-only audit");
  }
  const audit = new DualAuditLayer(redis, auditLog);

  // Leader lease
  const lease = new RedisLeaderLease(redis, {
    key: "sentinel.scheduler.leader",
    ttlMs: parseInt(process.env.SCHEDULER_LEASE_TTL ?? "15000", 10),
    instanceId,
  });

  // Health server
  const healthPort = parseInt(process.env.SCHEDULER_PORT ?? "9091", 10);
  const healthServer = createHealthServer(metrics, healthPort, { circuitBreaker, lease });
  logger.info({ port: healthPort, instanceId }, "Scheduler health server listening");

  // Register all jobs
  const registry = new JobRegistry();
  const allJobs: SchedulerJob[] = [
    new SelfScanJob(),
    new RetentionJob(),
    new ComplianceSnapshotJob(),
    new TrendsRefreshJob(),
    new EvidenceCheckJob(),
    new HealthCheckJob(),
  ];
  if (config.cveRescanEnabled) {
    allJobs.push(new CVERescanJob());
  }
  for (const job of allJobs) {
    registry.register(job);
    metrics.registerSchedule(job.name, job.schedule);
  }

  // Build job context
  const ctx: JobContext = { eventBus, db, redis, metrics, audit, logger };

  // Wrapper: check leader + circuit breaker before executing
  function wrapJobExecution(job: SchedulerJob) {
    return async () => {
      if (!lease.isLeader()) {
        return; // Passive replica, skip
      }
      // Check circuit breaker for all dependencies
      for (const dep of job.dependencies) {
        if (!circuitBreaker.canExecute(dep, job.tier)) {
          await audit.log({
            jobName: job.name,
            action: "skipped",
            timestamp: new Date().toISOString(),
            detail: { reason: `circuit open for ${dep}` },
          });
          logger.warn({ job: job.name, dep }, "Job skipped: circuit breaker open");
          return;
        }
      }
      try {
        await registry.executeJob(job.name, ctx);
        for (const dep of job.dependencies) {
          circuitBreaker.recordSuccess(dep);
        }
      } catch (err) {
        for (const dep of job.dependencies) {
          circuitBreaker.recordFailure(dep);
        }
        logger.error({ err, job: job.name }, "Scheduled job failed");
      }
    };
  }

  // Schedule all jobs with node-cron
  for (const job of registry.getJobs()) {
    cron.schedule(job.schedule, wrapJobExecution(job));
    logger.info({ job: job.name, schedule: job.schedule }, "Cron job registered");
  }

  // Leader lease heartbeat: renew every ttl/3
  const leaseTtl = parseInt(process.env.SCHEDULER_LEASE_TTL ?? "15000", 10);
  const heartbeatInterval = Math.floor(leaseTtl / 3);
  setInterval(async () => {
    if (lease.isLeader()) {
      const renewed = await lease.renew();
      if (!renewed) {
        logger.warn("Leader lease renewal failed, lost leadership");
      }
    } else {
      const acquired = await lease.acquire();
      if (acquired) {
        logger.info({ instanceId }, "Acquired leader lease");
      }
    }
  }, heartbeatInterval);

  // Initial leader acquisition
  const acquired = await lease.acquire();
  logger.info({ instanceId, isLeader: acquired }, "Initial leader lease attempt");

  // Org override poll: every 5 minutes
  await orgManager.loadOverrides();
  setInterval(async () => {
    await orgManager.loadOverrides();
  }, 300_000);

  // Scan timeout check: integrated into health-check job cycle
  // HealthCheckJob runs every 5 min; lifecycle tracker checks happen there

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Scheduler shutting down...");
    healthServer.close();
    await lease.release();
    await eventBus.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info({ instanceId, jobs: registry.getJobs().map(j => j.name) }, "Scheduler running");
}
```

**Step 2: Replace old scheduler.ts with thin entrypoint**

Replace `apps/api/src/scheduler.ts` with:

```typescript
// Thin entrypoint — delegates to scheduler/ module
import { startScheduler } from "./scheduler/index.js";

if (process.env.NODE_ENV !== "test") {
  startScheduler().catch((err) => {
    console.error("Scheduler failed to start:", err);
    process.exit(1);
  });
}

// Re-export for backwards compatibility with existing tests
export {
  buildSchedulerConfig,
  shouldTriggerScan,
  SchedulerMetrics,
  createHealthServer,
  RETENTION_SCHEDULE,
  COMPLIANCE_SNAPSHOT_SCHEDULE,
  HEALTH_CHECK_SCHEDULE,
} from "./scheduler/index.js";
export type { SchedulerConfig } from "./scheduler/index.js";
```

**Step 3: Update existing tests**

Verify that `apps/api/src/__tests__/scheduler.test.ts` still imports from `../scheduler.js` — since we re-export everything, existing tests should pass without changes.

**Step 4: Run all scheduler tests**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/ src/__tests__/scheduler.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add apps/api/src/scheduler/index.ts apps/api/src/scheduler.ts
git commit -m "feat(scheduler): wire SchedulerService with leader lease, circuit breaker, registry"
```

---

## Phase 4: Docker and Config (Task 12)

### Task 12: Update Docker Compose and Environment Config

**Files:**
- Modify: `docker-compose.yml` (add postgres dep to scheduler)
- Modify: `docker-compose.sentinel.yml` (add postgres dep + DATABASE_URL to scheduler)
- Modify: `.env.example` (add SCHEDULER_LEASE_TTL, SCAN_TIMEOUT_MS)

**Step 1: Update docker-compose.yml scheduler service**

Add `postgres` dependency and `DATABASE_URL` to the scheduler service in `docker-compose.yml`:

```yaml
  scheduler:
    build:
      context: .
      dockerfile: docker/api.Dockerfile
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://sentinel:sentinel_dev@postgres:5432/sentinel
      REDIS_URL: redis://redis:6379
      SELF_SCAN_ENABLED: ${SELF_SCAN_ENABLED:-true}
      SCHEDULER_PORT: "9091"
      SCHEDULER_LEASE_TTL: "15000"
      SCAN_TIMEOUT_MS: "300000"
    command: ["node", "apps/api/dist/scheduler.js"]
    healthcheck:
      test: ["CMD", "node", "docker/healthcheck.js", "9091"]
      interval: 30s
      timeout: 5s
      retries: 3
```

**Step 2: Update docker-compose.sentinel.yml scheduler service**

Add `postgres` dependency and `DATABASE_URL` to the scheduler in production compose:

```yaml
  scheduler:
    build:
      context: .
      dockerfile: docker/api.Dockerfile
    restart: unless-stopped
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    networks:
      - sentinel-internal
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      SELF_SCAN_ENABLED: ${SELF_SCAN_ENABLED:-true}
      SCHEDULER_PORT: "9091"
      SCHEDULER_LEASE_TTL: ${SCHEDULER_LEASE_TTL:-15000}
      SCAN_TIMEOUT_MS: ${SCAN_TIMEOUT_MS:-300000}
      NODE_ENV: production
    command: ["node", "apps/api/dist/scheduler.js"]
    healthcheck:
      test: ["CMD", "node", "docker/healthcheck.js", "9091"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
```

**Step 3: Update .env.example**

Add under the self-scan scheduler section:

```
# Scheduler HA
SCHEDULER_LEASE_TTL=15000
SCAN_TIMEOUT_MS=300000
```

**Step 4: Commit**

```bash
git add docker-compose.yml docker-compose.sentinel.yml .env.example
git commit -m "feat(scheduler): add postgres dependency and HA config to Docker Compose"
```

---

## Phase 5: Integration Tests (Task 13)

### Task 13: Integration Test for Full Scheduler Pipeline

**Files:**
- Create: `apps/api/src/scheduler/__tests__/integration.test.ts`

**Step 1: Write the integration test**

Create `apps/api/src/scheduler/__tests__/integration.test.ts`:

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";
import { JobRegistry } from "../job-registry.js";
import { CircuitBreakerManager } from "../circuit-breaker.js";
import { SelfScanJob } from "../jobs/self-scan.js";
import { HealthCheckJob } from "../jobs/health-check.js";
import type { JobContext, SchedulerJob } from "../types.js";

function createMockContext(): JobContext {
  return {
    eventBus: { publish: vi.fn(async () => "msg-1") } as any,
    db: {
      organization: { findMany: vi.fn(async () => []) },
    } as any,
    redis: {} as any,
    metrics: {
      registerSchedule: vi.fn(),
      recordTrigger: vi.fn(),
      recordError: vi.fn(),
      getTriggerCount: vi.fn(() => 0),
      getErrorCount: vi.fn(() => 0),
      toPrometheus: vi.fn(() => ""),
      getHealthStatus: vi.fn(() => ({ status: "ok", uptime: 0, lastTrigger: {}, nextScheduled: {} })),
    },
    audit: { log: vi.fn(async () => {}), recent: vi.fn(async () => []) } as any,
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any,
  };
}

describe("Scheduler integration", () => {
  test("full job registration and execution pipeline", async () => {
    const registry = new JobRegistry();
    const selfScan = new SelfScanJob();
    registry.register(selfScan);

    const ctx = createMockContext();
    await registry.executeJob("self-scan", ctx);

    // Verify audit was called for both triggered and completed
    expect(ctx.audit.log).toHaveBeenCalledTimes(2);
    expect(ctx.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "triggered" }),
    );
    expect(ctx.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "completed" }),
    );

    // Verify EventBus received the scan event
    expect(ctx.eventBus.publish).toHaveBeenCalledWith(
      "sentinel.diffs",
      expect.objectContaining({ triggeredBy: "scheduler" }),
    );

    // Verify metrics recorded
    expect(ctx.metrics.recordTrigger).toHaveBeenCalledWith("self-scan");
  });

  test("circuit breaker prevents job execution when open", async () => {
    const cb = new CircuitBreakerManager();
    // Trip the circuit for redis (5 failures for critical)
    for (let i = 0; i < 5; i++) cb.recordFailure("redis");
    expect(cb.canExecute("redis", "critical")).toBe(false);

    // Non-critical should also be blocked (3 < 5 failures)
    expect(cb.canExecute("redis", "non-critical")).toBe(false);
  });

  test("circuit breaker allows non-critical jobs when below critical threshold", () => {
    const cb = new CircuitBreakerManager();
    cb.recordFailure("postgres");
    cb.recordFailure("postgres");
    // 2 failures: below non-critical threshold (3)
    expect(cb.canExecute("postgres", "non-critical")).toBe(true);
    expect(cb.canExecute("postgres", "critical")).toBe(true);
  });

  test("failed job records error in audit trail", async () => {
    const registry = new JobRegistry();
    const failJob: SchedulerJob = {
      name: "fail-job",
      schedule: "* * * * *",
      tier: "non-critical",
      dependencies: ["redis"],
      execute: async () => { throw new Error("intentional failure"); },
    };
    registry.register(failJob);

    const ctx = createMockContext();
    await expect(registry.executeJob("fail-job", ctx)).rejects.toThrow("intentional failure");
    expect(ctx.metrics.recordError).toHaveBeenCalledWith("fail-job");
    expect(ctx.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "failed", jobName: "fail-job" }),
    );
  });

  test("all default jobs register without conflict", () => {
    const registry = new JobRegistry();
    const jobs = [
      new SelfScanJob(),
      new HealthCheckJob(),
    ];
    for (const job of jobs) {
      registry.register(job);
    }
    expect(registry.getJobs()).toHaveLength(2);
  });
});
```

**Step 2: Run integration tests**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/integration.test.ts`
Expected: PASS

**Step 3: Run ALL scheduler tests**

Run: `cd apps/api && npx vitest run src/scheduler/__tests__/ src/__tests__/scheduler.test.ts`
Expected: ALL PASS

**Step 4: Run full API test suite**

Run: `cd apps/api && npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add apps/api/src/scheduler/__tests__/integration.test.ts
git commit -m "test(scheduler): add integration tests for full scheduler pipeline"
```

---

## Summary

| Phase | Tasks | What's Built |
|-------|-------|-------------|
| 1: Core Infra | 1-4 | Types, LeaderLease, CircuitBreaker, AuditLayer |
| 2: Jobs | 5-8 | 7 SchedulerJob implementations + LifecycleTracker |
| 3: Orchestration | 9-11 | OrgScheduleManager, JobRegistry, SchedulerService entrypoint |
| 4: Docker | 12 | Docker Compose updates, env config |
| 5: Integration | 13 | End-to-end integration tests |

**Total: 13 tasks, ~30 new test cases, 14 new files, 3 modified files**
