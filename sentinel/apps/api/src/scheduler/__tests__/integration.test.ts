import { describe, test, expect, vi, beforeEach } from "vitest";
import { JobRegistry } from "../job-registry.js";
import { CircuitBreakerManager } from "../circuit-breaker.js";
import { DualAuditLayer } from "../audit-layer.js";
import type { SchedulerJob, JobContext, SchedulerAuditEntry } from "../types.js";

/* ------------------------------------------------------------------ */
/*  Shared mock factories                                              */
/* ------------------------------------------------------------------ */

function createMockRedis() {
  const streams: Array<{ id: string; data: string }> = [];
  return {
    xadd: vi.fn(async (..._args: unknown[]) => {
      const id = `${Date.now()}-0`;
      const dataIdx = _args.indexOf("data");
      const data = dataIdx >= 0 && dataIdx + 1 < _args.length ? String(_args[dataIdx + 1]) : "";
      streams.push({ id, data });
      return id;
    }),
    xrevrange: vi.fn(async () => {
      return streams.map((s) => [s.id, ["data", s.data]]);
    }),
    _streams: streams,
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

function createMockMetrics() {
  return {
    registerSchedule: vi.fn(),
    recordTrigger: vi.fn(),
    recordError: vi.fn(),
    getTriggerCount: vi.fn(() => 0),
    getErrorCount: vi.fn(() => 0),
    toPrometheus: vi.fn(() => ""),
    getHealthStatus: vi.fn(() => ({
      status: "ok",
      uptime: 0,
      lastTrigger: {},
      nextScheduled: {},
    })),
  };
}

function createTestJob(overrides: Partial<SchedulerJob> = {}): SchedulerJob {
  return {
    name: "integration-job",
    schedule: "*/5 * * * *",
    tier: "non-critical",
    dependencies: ["redis"],
    execute: vi.fn(async () => {}),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Integration tests                                                  */
/* ------------------------------------------------------------------ */

describe("Scheduler pipeline integration", () => {
  let registry: JobRegistry;
  let circuitBreaker: CircuitBreakerManager;
  let redis: ReturnType<typeof createMockRedis>;
  let pgAuditLog: ReturnType<typeof createMockAuditLog>;
  let auditLayer: DualAuditLayer;
  let metrics: ReturnType<typeof createMockMetrics>;

  beforeEach(() => {
    registry = new JobRegistry();
    circuitBreaker = new CircuitBreakerManager();
    redis = createMockRedis();
    pgAuditLog = createMockAuditLog();
    auditLayer = new DualAuditLayer(redis as any, pgAuditLog as any);
    metrics = createMockMetrics();
  });

  function buildContext(): JobContext {
    return {
      eventBus: { publish: vi.fn() } as any,
      db: {} as any,
      redis: redis as any,
      metrics,
      audit: auditLayer,
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  1. Job registration and execution with audit trail               */
  /* ---------------------------------------------------------------- */

  describe("job registration and execution", () => {
    test("registers a job, executes it, and records audit trail", async () => {
      const job = createTestJob();
      registry.register(job);

      const ctx = buildContext();
      await registry.executeJob("integration-job", ctx);

      // Job was executed
      expect(job.execute).toHaveBeenCalledWith(ctx);
      expect(job.execute).toHaveBeenCalledTimes(1);

      // Metrics recorded
      expect(metrics.recordTrigger).toHaveBeenCalledWith("integration-job");

      // Audit trail has both "triggered" and "completed" entries in Redis
      expect(redis.xadd).toHaveBeenCalledTimes(2);

      // Verify Redis stream entries contain the correct actions
      const streamEntries = redis._streams.map((s) => JSON.parse(s.data) as SchedulerAuditEntry);
      expect(streamEntries).toHaveLength(2);
      expect(streamEntries[0].action).toBe("triggered");
      expect(streamEntries[0].jobName).toBe("integration-job");
      expect(streamEntries[1].action).toBe("completed");
      expect(streamEntries[1].jobName).toBe("integration-job");

      // PG audit log also received both entries
      expect(pgAuditLog.append).toHaveBeenCalledTimes(2);
      expect(pgAuditLog._entries).toHaveLength(2);
    });

    test("recent() returns entries written during execution", async () => {
      const job = createTestJob();
      registry.register(job);

      const ctx = buildContext();
      await registry.executeJob("integration-job", ctx);

      const recent = await auditLayer.recent(10);
      expect(recent.length).toBe(2);
      expect(recent.map((e) => e.action)).toEqual(["triggered", "completed"]);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  2. Circuit breaker gating                                        */
  /* ---------------------------------------------------------------- */

  describe("circuit breaker gating", () => {
    test("skips job when dependency circuit is open", async () => {
      const job = createTestJob({
        name: "gated-job",
        dependencies: ["redis"],
        tier: "non-critical",
      });
      registry.register(job);

      // Trip the circuit breaker for redis (non-critical threshold = 3)
      circuitBreaker.recordFailure("redis");
      circuitBreaker.recordFailure("redis");
      circuitBreaker.recordFailure("redis");
      expect(circuitBreaker.getState("redis")).toBe("open");

      // Simulate the scheduler gating logic: check all deps before executing
      const ctx = buildContext();
      const blocked = job.dependencies.some(
        (dep) => !circuitBreaker.canExecute(dep, job.tier),
      );

      if (blocked) {
        await ctx.audit.log({
          jobName: job.name,
          action: "circuit_open",
          timestamp: new Date().toISOString(),
          detail: { blockedDependency: "redis" },
        });
      } else {
        await registry.executeJob("gated-job", ctx);
      }

      // Job should NOT have been executed
      expect(job.execute).not.toHaveBeenCalled();

      // Audit should record circuit_open
      const entries = redis._streams.map((s) => JSON.parse(s.data) as SchedulerAuditEntry);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("circuit_open");
      expect(entries[0].jobName).toBe("gated-job");
      expect(entries[0].detail).toEqual(
        expect.objectContaining({ blockedDependency: "redis" }),
      );
    });

    test("allows job when circuit is closed", async () => {
      const job = createTestJob({
        name: "allowed-job",
        dependencies: ["redis"],
        tier: "non-critical",
      });
      registry.register(job);

      // Circuit starts closed
      expect(circuitBreaker.canExecute("redis", "non-critical")).toBe(true);

      const ctx = buildContext();
      const blocked = job.dependencies.some(
        (dep) => !circuitBreaker.canExecute(dep, job.tier),
      );

      expect(blocked).toBe(false);
      await registry.executeJob("allowed-job", ctx);

      expect(job.execute).toHaveBeenCalledTimes(1);
    });

    test("allows job after circuit recovers via success", async () => {
      const job = createTestJob({
        name: "recovery-job",
        dependencies: ["redis"],
        tier: "non-critical",
      });
      registry.register(job);

      // Open the circuit
      circuitBreaker.recordFailure("redis");
      circuitBreaker.recordFailure("redis");
      circuitBreaker.recordFailure("redis");
      expect(circuitBreaker.canExecute("redis", "non-critical")).toBe(false);

      // Simulate recovery
      circuitBreaker.recordSuccess("redis");
      expect(circuitBreaker.getState("redis")).toBe("closed");
      expect(circuitBreaker.canExecute("redis", "non-critical")).toBe(true);

      const ctx = buildContext();
      await registry.executeJob("recovery-job", ctx);
      expect(job.execute).toHaveBeenCalledTimes(1);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  3. Audit trail dual-write verification                           */
  /* ---------------------------------------------------------------- */

  describe("audit trail dual-write", () => {
    test("writes to both Redis stream and PG for each audit entry", async () => {
      const job = createTestJob({ name: "dual-write-job" });
      registry.register(job);

      const ctx = buildContext();
      await registry.executeJob("dual-write-job", ctx);

      // Redis stream: 2 xadd calls (triggered + completed)
      expect(redis.xadd).toHaveBeenCalledTimes(2);

      // PG audit log: 2 append calls
      expect(pgAuditLog.append).toHaveBeenCalledTimes(2);

      // Verify PG entries contain the scheduler actor
      const pgTriggered = pgAuditLog._entries[0] as any;
      expect(pgTriggered.actor).toEqual({
        type: "system",
        id: "scheduler",
        name: "sentinel-scheduler",
      });
      expect(pgTriggered.action).toBe("scheduler.triggered");
      expect(pgTriggered.resource).toEqual({
        type: "scheduler-job",
        id: "dual-write-job",
      });

      const pgCompleted = pgAuditLog._entries[1] as any;
      expect(pgCompleted.action).toBe("scheduler.completed");
    });

    test("Redis entry and PG entry carry the same job name and timestamp", async () => {
      const job = createTestJob({ name: "consistency-job" });
      registry.register(job);

      const ctx = buildContext();
      await registry.executeJob("consistency-job", ctx);

      const redisEntries = redis._streams.map((s) => JSON.parse(s.data) as SchedulerAuditEntry);
      const pgEntries = pgAuditLog._entries as any[];

      // Both stores recorded 2 events
      expect(redisEntries).toHaveLength(2);
      expect(pgEntries).toHaveLength(2);

      // Job names match across stores
      expect(redisEntries[0].jobName).toBe("consistency-job");
      expect(pgEntries[0].resource.id).toBe("consistency-job");

      // Timestamps written to PG detail match those in Redis entries
      expect(pgEntries[0].detail.timestamp).toBe(redisEntries[0].timestamp);
      expect(pgEntries[1].detail.timestamp).toBe(redisEntries[1].timestamp);
    });

    test("continues writing to Redis even when PG fails", async () => {
      pgAuditLog.append.mockRejectedValue(new Error("PG connection lost"));

      const job = createTestJob({ name: "pg-down-job" });
      registry.register(job);

      const ctx = buildContext();
      await registry.executeJob("pg-down-job", ctx);

      // Redis still received both writes
      expect(redis.xadd).toHaveBeenCalledTimes(2);

      // PG was attempted but failed
      expect(pgAuditLog.append).toHaveBeenCalledTimes(2);

      // Job still completed successfully
      expect(job.execute).toHaveBeenCalledTimes(1);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  4. Failed job error recording                                    */
  /* ---------------------------------------------------------------- */

  describe("failed job error recording", () => {
    test("records error message in audit with status 'failed'", async () => {
      const failingJob = createTestJob({
        name: "failing-job",
        execute: vi.fn(async () => {
          throw new Error("connection timeout");
        }),
      });
      registry.register(failingJob);

      const ctx = buildContext();
      await expect(registry.executeJob("failing-job", ctx)).rejects.toThrow(
        "connection timeout",
      );

      // Metrics recorded the error
      expect(metrics.recordError).toHaveBeenCalledWith("failing-job");
      expect(metrics.recordTrigger).not.toHaveBeenCalled();

      // Redis audit: "triggered" then "failed"
      const redisEntries = redis._streams.map((s) => JSON.parse(s.data) as SchedulerAuditEntry);
      expect(redisEntries).toHaveLength(2);
      expect(redisEntries[0].action).toBe("triggered");
      expect(redisEntries[1].action).toBe("failed");
      expect(redisEntries[1].detail).toEqual(
        expect.objectContaining({ error: "connection timeout" }),
      );

      // PG audit also has the failed entry
      const pgFailed = pgAuditLog._entries[1] as any;
      expect(pgFailed.action).toBe("scheduler.failed");
      expect(pgFailed.detail.error).toBe("connection timeout");
    });

    test("records non-Error throws as string in audit", async () => {
      const stringThrowJob = createTestJob({
        name: "string-throw-job",
        execute: vi.fn(async () => {
          throw "raw string error"; // eslint-disable-line no-throw-literal
        }),
      });
      registry.register(stringThrowJob);

      const ctx = buildContext();
      await expect(registry.executeJob("string-throw-job", ctx)).rejects.toBe(
        "raw string error",
      );

      const redisEntries = redis._streams.map((s) => JSON.parse(s.data) as SchedulerAuditEntry);
      const failedEntry = redisEntries.find((e) => e.action === "failed");
      expect(failedEntry).toBeDefined();
      expect(failedEntry!.detail).toEqual(
        expect.objectContaining({ error: "raw string error" }),
      );
    });

    test("circuit breaker + failed job: error is recorded before circuit opens", async () => {
      const failingJob = createTestJob({
        name: "circuit-fail-job",
        dependencies: ["postgres"],
        tier: "non-critical",
        execute: vi.fn(async () => {
          throw new Error("db unavailable");
        }),
      });
      registry.register(failingJob);

      const ctx = buildContext();

      // Execute the failing job multiple times and record failures in circuit breaker
      for (let i = 0; i < 3; i++) {
        const canRun = failingJob.dependencies.every((dep) =>
          circuitBreaker.canExecute(dep, failingJob.tier),
        );
        if (canRun) {
          try {
            await registry.executeJob("circuit-fail-job", ctx);
          } catch {
            circuitBreaker.recordFailure("postgres");
          }
        }
      }

      // Circuit should now be open for non-critical postgres jobs
      expect(circuitBreaker.getState("postgres")).toBe("open");
      expect(circuitBreaker.canExecute("postgres", "non-critical")).toBe(false);

      // All 3 executions produced triggered + failed audit entries (6 total)
      const redisEntries = redis._streams.map((s) => JSON.parse(s.data) as SchedulerAuditEntry);
      const failedEntries = redisEntries.filter((e) => e.action === "failed");
      expect(failedEntries).toHaveLength(3);
      failedEntries.forEach((entry) => {
        expect(entry.detail).toEqual(
          expect.objectContaining({ error: "db unavailable" }),
        );
      });

      // Metrics recorded 3 errors
      expect(metrics.recordError).toHaveBeenCalledTimes(3);
    });
  });
});
