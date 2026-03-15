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

  test("queries organizations from DB", async () => {
    const job = new RetentionJob();
    const ctx = createMockContext();
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
