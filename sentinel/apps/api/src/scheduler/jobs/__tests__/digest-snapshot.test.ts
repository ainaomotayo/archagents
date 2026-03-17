import { describe, it, expect, vi, beforeEach } from "vitest";
import { DigestSnapshotJob } from "../digest-snapshot.js";

describe("DigestSnapshotJob", () => {
  let job: DigestSnapshotJob;
  let ctx: any;

  beforeEach(() => {
    job = new DigestSnapshotJob();
    ctx = {
      db: {
        organization: { findMany: vi.fn().mockResolvedValue([{ id: "org-1" }]) },
        scan: { count: vi.fn().mockResolvedValue(42) },
        finding: {
          groupBy: vi.fn().mockResolvedValue([
            { severity: "critical", _count: { id: 2 } },
            { severity: "high", _count: { id: 5 } },
            { severity: "medium", _count: { id: 10 } },
            { severity: "low", _count: { id: 20 } },
          ]),
          findMany: vi.fn().mockResolvedValue([]),
        },
        complianceSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
        controlAttestation: { count: vi.fn().mockResolvedValue(0) },
        remediationSnapshot: { findFirst: vi.fn().mockResolvedValue(null) },
        aiMetricsSnapshot: { findFirst: vi.fn().mockResolvedValue(null) },
        digestSnapshot: { upsert: vi.fn().mockResolvedValue({}) },
      },
      eventBus: { publish: vi.fn() },
      logger: { info: vi.fn(), error: vi.fn() },
      metrics: { recordTrigger: vi.fn(), recordError: vi.fn() },
      audit: { log: vi.fn() },
      redis: {},
    };
  });

  it("has correct metadata", () => {
    expect(job.name).toBe("digest-snapshot");
    expect(job.schedule).toBe("0 4 * * *");
    expect(job.tier).toBe("non-critical");
    expect(job.dependencies).toContain("postgres");
  });

  it("upserts digest snapshot for each org", async () => {
    await job.execute(ctx);
    expect(ctx.db.digestSnapshot.upsert).toHaveBeenCalledTimes(1);
    const call = ctx.db.digestSnapshot.upsert.mock.calls[0][0];
    expect(call.where.orgId_snapshotDate.orgId).toBe("org-1");
    expect(call.create.metrics).toBeDefined();
    expect(call.create.metrics.scanVolume).toBeDefined();
    expect(call.create.metrics.findingSummary).toBeDefined();
  });

  it("handles multiple orgs", async () => {
    ctx.db.organization.findMany.mockResolvedValue([
      { id: "org-1" },
      { id: "org-2" },
    ]);
    await job.execute(ctx);
    expect(ctx.db.digestSnapshot.upsert).toHaveBeenCalledTimes(2);
  });

  it("computes week-over-week scan delta", async () => {
    ctx.db.scan.count
      .mockResolvedValueOnce(42) // this week
      .mockResolvedValueOnce(30); // last week
    await job.execute(ctx);
    const metrics = ctx.db.digestSnapshot.upsert.mock.calls[0][0].create.metrics;
    expect(metrics.scanVolume.total).toBe(42);
    expect(metrics.scanVolume.weekOverWeek).toBe(12);
  });

  it("logs org count", async () => {
    await job.execute(ctx);
    expect(ctx.logger.info).toHaveBeenCalledWith(
      { orgCount: 1 },
      "Digest snapshots materialized",
    );
  });
});
