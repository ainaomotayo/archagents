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
      expect.objectContaining({ triggeredBy: "scheduler" }),
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
      expect.objectContaining({ triggeredBy: "scheduler" }),
    );
  });
});
