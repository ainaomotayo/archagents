import { describe, it, expect, vi, beforeEach } from "vitest";
import { AIMetricsService } from "../ai-metrics/service.js";

function makeMockDb() {
  return {
    finding: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    aIMetricsSnapshot: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    aIMetricsConfig: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
}

const ORG = "org-1";

function makeFinding(overrides: any = {}) {
  return {
    id: "f-1",
    file: "src/app.ts",
    projectId: "proj-1",
    confidence: 0.8,
    rawData: {
      ai_probability: 0.9,
      loc: 100,
      marker_tools: ["copilot"],
      estimated_tool: "copilot",
    },
    project: { name: "My Project" },
    ...overrides,
  };
}

describe("AIMetricsService", () => {
  let db: ReturnType<typeof makeMockDb>;
  let service: AIMetricsService;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeMockDb();
    service = new AIMetricsService(db as any);
  });

  describe("getCurrentStats", () => {
    it("returns hasData false and zeros when no findings", async () => {
      db.finding.findMany.mockResolvedValue([]);

      const result = await service.getCurrentStats(ORG);

      expect(result.hasData).toBe(false);
      expect(result.stats.aiRatio).toBe(0);
      expect(result.stats.totalFiles).toBe(0);
      expect(result.toolBreakdown).toEqual([]);
    });

    it("computes stats from findings", async () => {
      db.finding.findMany.mockResolvedValue([
        makeFinding({ file: "a.ts", rawData: { ai_probability: 0.9, loc: 100, marker_tools: ["copilot"], estimated_tool: "copilot" } }),
        makeFinding({ file: "b.ts", rawData: { ai_probability: 0.2, loc: 50, marker_tools: [], estimated_tool: null } }),
      ]);

      const result = await service.getCurrentStats(ORG, 0.5);

      expect(result.hasData).toBe(true);
      expect(result.stats.totalFiles).toBe(2);
      expect(result.stats.aiFiles).toBe(1);
      expect(result.toolBreakdown.length).toBeGreaterThan(0);
    });
  });

  describe("getTrend", () => {
    it("returns empty trend for no snapshots", async () => {
      db.aIMetricsSnapshot.findMany.mockResolvedValue([]);

      const result = await service.getTrend(ORG, { days: 30 });

      expect(result.points).toEqual([]);
      expect(result.momChange).toBe(0);
    });

    it("uses correct granularity based on days", async () => {
      db.aIMetricsSnapshot.findMany.mockResolvedValue([]);

      // 30 days -> daily
      await service.getTrend(ORG, { days: 30 });
      expect(db.aIMetricsSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ granularity: "daily" }),
        }),
      );

      vi.clearAllMocks();

      // 120 days -> weekly
      await service.getTrend(ORG, { days: 120 });
      expect(db.aIMetricsSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ granularity: "weekly" }),
        }),
      );
    });
  });

  describe("getConfig", () => {
    it("returns defaults when no config exists", async () => {
      db.aIMetricsConfig.findUnique.mockResolvedValue(null);

      const config = await service.getConfig(ORG);

      expect(config.threshold).toBe(0.5);
      expect(config.alertEnabled).toBe(false);
      expect(config.alertMaxRatio).toBeNull();
      expect(config.alertSpikeStdDev).toBe(2);
      expect(config.alertNewTool).toBe(false);
    });

    it("returns stored config", async () => {
      db.aIMetricsConfig.findUnique.mockResolvedValue({
        threshold: 0.7,
        alertEnabled: true,
        alertMaxRatio: 0.8,
        alertSpikeStdDev: 3,
        alertNewTool: true,
      });

      const config = await service.getConfig(ORG);

      expect(config.threshold).toBe(0.7);
      expect(config.alertEnabled).toBe(true);
      expect(config.alertMaxRatio).toBe(0.8);
    });
  });

  describe("updateConfig", () => {
    it("validates threshold range", async () => {
      await expect(service.updateConfig(ORG, { threshold: 1.5 })).rejects.toThrow(
        "Threshold must be between 0 and 1",
      );
      await expect(service.updateConfig(ORG, { threshold: -0.1 })).rejects.toThrow(
        "Threshold must be between 0 and 1",
      );
    });

    it("upserts config", async () => {
      await service.updateConfig(ORG, { threshold: 0.6, alertEnabled: true });

      expect(db.aIMetricsConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: ORG },
          create: expect.objectContaining({ orgId: ORG, threshold: 0.6, alertEnabled: true }),
          update: expect.objectContaining({ threshold: 0.6, alertEnabled: true }),
        }),
      );
    });
  });

  describe("getProjectLeaderboard", () => {
    it("returns projects with metrics sorted by aiRatio", async () => {
      db.finding.findMany.mockResolvedValue([
        makeFinding({
          projectId: "proj-1",
          file: "a.ts",
          project: { name: "Alpha" },
          rawData: { ai_probability: 0.9, loc: 200, marker_tools: [], estimated_tool: null },
        }),
        makeFinding({
          projectId: "proj-2",
          file: "b.ts",
          project: { name: "Beta" },
          rawData: { ai_probability: 0.6, loc: 100, marker_tools: [], estimated_tool: null },
        }),
      ]);

      const result = await service.getProjectLeaderboard(ORG);

      expect(result.length).toBe(2);
      // Both are above default 0.5 threshold, so aiRatio = 1.0 for both
      expect(result[0]).toHaveProperty("projectId");
      expect(result[0]).toHaveProperty("projectName");
      expect(result[0]).toHaveProperty("aiRatio");
      expect(result[0]).toHaveProperty("totalFiles");
    });
  });

  describe("compareProjects", () => {
    it("throws when fewer than 2 or more than 5 projects", async () => {
      await expect(service.compareProjects(ORG, ["p1"])).rejects.toThrow(
        "Select 2-5 projects to compare",
      );
      await expect(
        service.compareProjects(ORG, ["p1", "p2", "p3", "p4", "p5", "p6"]),
      ).rejects.toThrow("Select 2-5 projects to compare");
    });
  });

  describe("generateDailySnapshot", () => {
    it("creates org-wide and per-project snapshots from findings", async () => {
      const findings = [
        makeFinding({
          projectId: "proj-1",
          file: "a.ts",
          rawData: { ai_probability: 0.9, loc: 100, marker_tools: [], estimated_tool: null },
        }),
        makeFinding({
          projectId: "proj-2",
          file: "b.ts",
          rawData: { ai_probability: 0.8, loc: 50, marker_tools: [], estimated_tool: null },
        }),
      ];
      db.finding.findMany.mockResolvedValue(findings);

      const date = new Date("2026-03-14");
      await service.generateDailySnapshot(ORG, date);

      // org-wide + 2 projects = 3 upserts
      expect(db.aIMetricsSnapshot.upsert).toHaveBeenCalledTimes(3);

      // First call is org-wide (projectId null in create)
      const orgCall = db.aIMetricsSnapshot.upsert.mock.calls[0][0];
      expect(orgCall.create.projectId).toBeNull();
      expect(orgCall.create.granularity).toBe("daily");
      expect(orgCall.create.snapshotDate).toEqual(date);
    });
  });
});
