import { describe, it, expect, vi, beforeEach } from "vitest";
import { RemediationSnapshotJob } from "../remediation-snapshot.js";

describe("RemediationSnapshotJob", () => {
  let job: RemediationSnapshotJob;
  let ctx: any;

  beforeEach(() => {
    job = new RemediationSnapshotJob();
    ctx = {
      db: {
        organization: {
          findMany: vi.fn().mockResolvedValue([{ id: "org-1" }]),
        },
        remediationItem: { count: vi.fn().mockResolvedValue(5) },
        remediationSnapshot: { upsert: vi.fn().mockResolvedValue({}) },
      },
      eventBus: { publish: vi.fn() },
      logger: { info: vi.fn(), error: vi.fn() },
      metrics: { recordTrigger: vi.fn(), recordError: vi.fn() },
      audit: { log: vi.fn() },
      redis: {},
    };
  });

  it("has correct schedule (daily at 2am)", () => {
    expect(job.schedule).toBe("0 2 * * *");
  });

  it("has correct metadata", () => {
    expect(job.name).toBe("remediation-snapshot");
    expect(job.tier).toBe("non-critical");
    expect(job.dependencies).toContain("postgres");
  });

  it("creates org-level snapshot", async () => {
    await job.execute(ctx);
    expect(ctx.db.remediationSnapshot.upsert).toHaveBeenCalled();
    expect(ctx.db.remediationItem.count).toHaveBeenCalledTimes(4);
  });

  it("handles multiple orgs", async () => {
    ctx.db.organization.findMany.mockResolvedValue([
      { id: "org-1" },
      { id: "org-2" },
    ]);
    await job.execute(ctx);
    expect(ctx.db.remediationSnapshot.upsert).toHaveBeenCalledTimes(2);
  });

  it("passes correct status filters for counts", async () => {
    await job.execute(ctx);
    const countCalls = ctx.db.remediationItem.count.mock.calls;
    // open count
    expect(countCalls[0][0].where.status).toBe("open");
    // in-progress count
    expect(countCalls[1][0].where.status.in).toEqual([
      "assigned",
      "in_progress",
      "in_review",
      "awaiting_deployment",
    ]);
    // completed count
    expect(countCalls[2][0].where.status).toBe("completed");
    // accepted_risk count
    expect(countCalls[3][0].where.status).toBe("accepted_risk");
  });

  it("logs the number of orgs processed", async () => {
    await job.execute(ctx);
    expect(ctx.logger.info).toHaveBeenCalledWith(
      { orgs: 1 },
      "Remediation snapshots captured",
    );
  });
});
