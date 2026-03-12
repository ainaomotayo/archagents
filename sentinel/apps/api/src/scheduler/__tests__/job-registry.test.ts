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

  test("executeJob throws for unknown job", async () => {
    const ctx = createMockContext();
    await expect(registry.executeJob("nope", ctx)).rejects.toThrow("not found");
  });
});
