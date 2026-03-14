import { describe, it, expect, vi, beforeEach } from "vitest";
import { AIMetricsSnapshotJob } from "../ai-metrics-snapshot.js";
import { AIMetricsRollupJob } from "../ai-metrics-rollup.js";
import { AIMetricsAnomalyJob } from "../ai-metrics-anomaly.js";
import type { JobContext } from "../../types.js";

const mockGenerateDailySnapshot = vi.fn().mockResolvedValue(undefined);
const mockGetActiveAlerts = vi.fn().mockResolvedValue([]);

vi.mock("@sentinel/compliance", () => {
  return {
    AIMetricsService: class {
      generateDailySnapshot = mockGenerateDailySnapshot;
      getActiveAlerts = mockGetActiveAlerts;
    },
  };
});

function createMockContext(overrides?: Record<string, any>): JobContext {
  return {
    eventBus: { publish: vi.fn(async () => "msg-1") } as any,
    db: {
      organization: { findMany: vi.fn(async () => [{ id: "org-1" }]) },
      finding: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
      aIMetricsSnapshot: {
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => null),
        upsert: vi.fn(async () => ({})),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
      aIMetricsConfig: { findUnique: vi.fn(async () => null) },
      project: { findMany: vi.fn(async () => []) },
      ...overrides,
    } as any,
    redis: {} as any,
    metrics: { recordTrigger: vi.fn(), recordError: vi.fn() } as any,
    audit: { log: vi.fn(async () => {}) } as any,
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any,
  };
}

describe("AIMetricsSnapshotJob", () => {
  let job: AIMetricsSnapshotJob;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateDailySnapshot.mockResolvedValue(undefined);
    mockGetActiveAlerts.mockResolvedValue([]);
    job = new AIMetricsSnapshotJob();
  });

  it("has correct metadata", () => {
    expect(job.name).toBe("ai-metrics-daily-snapshot");
    expect(job.schedule).toBe("0 3 * * *");
    expect(job.tier).toBe("non-critical");
    expect(job.dependencies).toContain("postgres");
  });

  it("executes for all orgs and logs completion", async () => {
    mockGenerateDailySnapshot.mockResolvedValue(undefined);
    const ctx = createMockContext();
    ctx.db.organization.findMany.mockResolvedValue([
      { id: "org-1" },
      { id: "org-2" },
    ]);

    await job.execute(ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith(
      { generated: 2, total: 2 },
      "AI metrics daily snapshots generated",
    );
    // Should publish snapshot.generated event per org
    expect(ctx.eventBus.publish).toHaveBeenCalledTimes(2);
    expect(ctx.eventBus.publish).toHaveBeenCalledWith(
      "sentinel.notifications",
      expect.objectContaining({
        topic: "ai-metrics.snapshot.generated",
        orgId: "org-1",
      }),
    );
  });

  it("logs error per org on failure but continues", async () => {
    mockGenerateDailySnapshot.mockRejectedValue(new Error("db error"));

    const ctx = createMockContext();
    ctx.db.organization.findMany.mockResolvedValue([
      { id: "org-1" },
      { id: "org-2" },
    ]);

    await job.execute(ctx);

    expect(ctx.logger.error).toHaveBeenCalledTimes(2);
    expect(ctx.logger.info).toHaveBeenCalledWith(
      { generated: 0, total: 2 },
      "AI metrics daily snapshots generated",
    );
  });
});

describe("AIMetricsRollupJob", () => {
  let job: AIMetricsRollupJob;

  beforeEach(() => {
    job = new AIMetricsRollupJob();
  });

  it("has correct metadata", () => {
    expect(job.name).toBe("ai-metrics-rollup");
    expect(job.schedule).toBe("0 4 * * 1");
    expect(job.tier).toBe("non-critical");
    expect(job.dependencies).toContain("postgres");
  });

  it("skips orgs with no old snapshots", async () => {
    const ctx = createMockContext();
    await job.execute(ctx);

    expect(ctx.db.aIMetricsSnapshot.upsert).not.toHaveBeenCalled();
    expect(ctx.db.aIMetricsSnapshot.deleteMany).not.toHaveBeenCalled();
    expect(ctx.logger.info).toHaveBeenCalledWith(
      { rolledUp: 0 },
      "AI metrics weekly rollup completed",
    );
  });

  it("rolls up old daily snapshots into weekly", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);
    const ctx = createMockContext();
    ctx.db.aIMetricsSnapshot.findMany.mockResolvedValue([
      {
        id: "snap-1",
        projectId: null,
        snapshotDate: oldDate,
        aiRatio: 0.4,
        aiInfluenceScore: 0.3,
        totalFiles: 100,
        aiFiles: 40,
        scanCount: 10,
      },
    ]);

    await job.execute(ctx);

    expect(ctx.db.aIMetricsSnapshot.upsert).toHaveBeenCalled();
    expect(ctx.db.aIMetricsSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["snap-1"] } },
    });
    expect(ctx.logger.info).toHaveBeenCalledWith(
      { rolledUp: 1 },
      "AI metrics weekly rollup completed",
    );
  });
});

describe("AIMetricsAnomalyJob", () => {
  let job: AIMetricsAnomalyJob;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveAlerts.mockResolvedValue([]);
    job = new AIMetricsAnomalyJob();
  });

  it("has correct metadata", () => {
    expect(job.name).toBe("ai-metrics-anomaly-check");
    expect(job.schedule).toBe("0 * * * *");
    expect(job.tier).toBe("non-critical");
    expect(job.dependencies).toContain("postgres");
  });

  it("publishes alerts when anomalies detected", async () => {
    mockGetActiveAlerts.mockResolvedValue([
      { type: "threshold_exceeded", message: "Ratio too high", severity: "warning" },
      { type: "spike_detected", message: "Spike in AI ratio", severity: "warning" },
    ]);

    const ctx = createMockContext();
    await job.execute(ctx);

    expect(ctx.eventBus.publish).toHaveBeenCalledTimes(2);
    expect(ctx.eventBus.publish).toHaveBeenCalledWith(
      "sentinel.notifications",
      expect.objectContaining({
        topic: "ai-metrics.alert.threshold",
        orgId: "org-1",
      }),
    );
    expect(ctx.eventBus.publish).toHaveBeenCalledWith(
      "sentinel.notifications",
      expect.objectContaining({
        topic: "ai-metrics.alert.spike",
        orgId: "org-1",
      }),
    );
    expect(ctx.logger.info).toHaveBeenCalledWith(
      { alertCount: 2 },
      "AI metrics anomaly check completed",
    );
  });

  it("handles no alerts gracefully", async () => {
    mockGetActiveAlerts.mockResolvedValue([]);

    const ctx = createMockContext();
    await job.execute(ctx);

    expect(ctx.eventBus.publish).not.toHaveBeenCalled();
    expect(ctx.logger.info).toHaveBeenCalledWith(
      { alertCount: 0 },
      "AI metrics anomaly check completed",
    );
  });
});
