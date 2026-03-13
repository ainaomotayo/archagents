import { describe, test, expect, vi } from "vitest";
import { RemediationOverdueJob } from "../jobs/remediation-overdue.js";
import type { JobContext } from "../types.js";

function createMockContext(overrides?: Partial<Record<string, any>>): JobContext {
  return {
    eventBus: { publish: vi.fn(async () => "msg-1") } as any,
    db: {
      remediationItem: {
        findMany: overrides?.remediationFindMany ?? vi.fn(async () => []),
      },
    } as any,
    redis: {} as any,
    metrics: { recordTrigger: vi.fn(), recordError: vi.fn() } as any,
    audit: { log: vi.fn(async () => {}) } as any,
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any,
  };
}

describe("RemediationOverdueJob", () => {
  test("has correct metadata", () => {
    const job = new RemediationOverdueJob();
    expect(job.name).toBe("remediation-overdue");
    expect(job.schedule).toBe("0 * * * *");
    expect(job.tier).toBe("non-critical");
    expect(job.dependencies).toContain("postgres");
  });

  test("detects overdue remediations and publishes notifications", async () => {
    const job = new RemediationOverdueJob();
    const remediationFindMany = vi.fn(async () => [
      { id: "rem-1", orgId: "org-1", controlCode: "TS-1.4", title: "Fix encryption", dueDate: new Date() },
    ]);
    const ctx = createMockContext({ remediationFindMany });

    await job.execute(ctx);

    expect(ctx.eventBus.publish).toHaveBeenCalledWith(
      "sentinel.notifications",
      expect.objectContaining({
        topic: "remediation.overdue",
        orgId: "org-1",
      }),
    );
  });

  test("handles no overdue items gracefully", async () => {
    const job = new RemediationOverdueJob();
    const ctx = createMockContext();

    await job.execute(ctx);

    expect(ctx.eventBus.publish).not.toHaveBeenCalled();
    expect(ctx.logger.info).toHaveBeenCalledWith(
      { overdue: 0 },
      "Remediation overdue sweep complete",
    );
  });
});
