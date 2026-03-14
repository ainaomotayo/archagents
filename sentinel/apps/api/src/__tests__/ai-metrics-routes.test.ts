import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildAIMetricsRoutes } from "../routes/ai-metrics.js";

// ── Mock AIMetricsService ───────────────────────────────────────────────────
vi.mock("@sentinel/compliance", () => ({
  AIMetricsService: vi.fn().mockImplementation(() => ({
    getCurrentStats: vi.fn().mockResolvedValue({
      hasData: true,
      stats: { aiRatio: 0.35, aiInfluenceScore: 0.4, aiFiles: 7, totalFiles: 20 },
      toolBreakdown: [{ tool: "copilot", count: 5, ratio: 0.25 }],
    }),
    getTrend: vi.fn().mockResolvedValue({
      points: [{ date: "2026-03-01", aiRatio: 0.3 }],
      momChange: 0.05,
    }),
    getToolBreakdown: vi.fn().mockResolvedValue([
      { tool: "copilot", count: 5, ratio: 0.25 },
    ]),
    getProjectLeaderboard: vi.fn().mockResolvedValue([
      { projectId: "p1", projectName: "Alpha", aiRatio: 0.5, aiInfluenceScore: 0.6, aiFiles: 10, totalFiles: 20 },
    ]),
    compareProjects: vi.fn().mockImplementation((_orgId: string, projectIds: string[]) => {
      if (projectIds.length < 2 || projectIds.length > 5) {
        throw new Error("Select 2-5 projects to compare");
      }
      return Promise.resolve({ projects: [], trends: [] });
    }),
    getActiveAlerts: vi.fn().mockResolvedValue([]),
    getConfig: vi.fn().mockResolvedValue({
      threshold: 0.5,
      alertEnabled: false,
      alertMaxRatio: null,
      alertSpikeStdDev: 2,
      alertNewTool: false,
    }),
    updateConfig: vi.fn().mockImplementation((_orgId: string, data: any) => {
      if (data.threshold !== undefined && (data.threshold < 0 || data.threshold > 1)) {
        throw new Error("Threshold must be between 0 and 1");
      }
      return Promise.resolve({ threshold: data.threshold ?? 0.5 });
    }),
  })),
}));

describe("buildAIMetricsRoutes", () => {
  const mockDb = {
    aIMetricsSnapshot: {
      findFirst: vi.fn(),
    },
    aIMetricsConfig: {
      findUnique: vi.fn(),
    },
  };

  let routes: ReturnType<typeof buildAIMetricsRoutes>;

  beforeEach(() => {
    vi.clearAllMocks();
    routes = buildAIMetricsRoutes({ db: mockDb });
  });

  it("getStats returns hasData and stats shape", async () => {
    const result = await routes.getStats("org-1");
    expect(result).toHaveProperty("hasData", true);
    expect(result).toHaveProperty("stats");
    expect(result.stats).toHaveProperty("aiRatio");
    expect(result).toHaveProperty("toolBreakdown");
  });

  it("getTrend returns points and momChange", async () => {
    const result = await routes.getTrend("org-1", { days: 30 });
    expect(result).toHaveProperty("points");
    expect(result).toHaveProperty("momChange");
    expect(Array.isArray(result.points)).toBe(true);
  });

  it("getTools returns array of tool breakdown entries", async () => {
    const result = await routes.getTools("org-1", { projectId: "p1" });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("tool");
    expect(result[0]).toHaveProperty("count");
  });

  it("getProjects returns leaderboard array", async () => {
    const result = await routes.getProjects("org-1", { limit: 5 });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("projectId");
    expect(result[0]).toHaveProperty("aiRatio");
  });

  it("compareProjects rejects fewer than 2 projects", async () => {
    await expect(routes.compareProjects("org-1", ["p1"])).rejects.toThrow(
      "Select 2-5 projects to compare",
    );
  });

  it("getConfig returns default config shape", async () => {
    const result = await routes.getConfig("org-1");
    expect(result).toHaveProperty("threshold", 0.5);
    expect(result).toHaveProperty("alertEnabled", false);
    expect(result).toHaveProperty("alertSpikeStdDev");
  });

  it("updateConfig validates threshold out of range", async () => {
    await expect(routes.updateConfig("org-1", { threshold: 2.0 })).rejects.toThrow(
      "Threshold must be between 0 and 1",
    );
  });

  it("getAlerts returns empty array when alerts disabled", async () => {
    const result = await routes.getAlerts("org-1");
    expect(result).toEqual([]);
  });

  it("getCompliance returns complianceGaps from latest snapshot", async () => {
    mockDb.aIMetricsSnapshot.findFirst.mockResolvedValue({
      complianceGaps: { hipaa: 3, soc2: 1 },
    });
    const result = await routes.getCompliance("org-1");
    expect(result).toEqual({ hipaa: 3, soc2: 1 });
  });

  it("getCompliance returns empty object when no snapshot exists", async () => {
    mockDb.aIMetricsSnapshot.findFirst.mockResolvedValue(null);
    const result = await routes.getCompliance("org-1");
    expect(result).toEqual({});
  });
});
