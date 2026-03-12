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
