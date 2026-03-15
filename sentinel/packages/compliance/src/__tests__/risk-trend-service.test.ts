import { describe, it, expect, vi, beforeEach } from "vitest";
import { RiskTrendService } from "../risk-trend/service.js";

function makeMockDb() {
  return {
    scan: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

const ORG = "org-1";

describe("RiskTrendService", () => {
  let db: ReturnType<typeof makeMockDb>;
  let service: RiskTrendService;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeMockDb();
    service = new RiskTrendService(db as any);
  });

  describe("getTrends", () => {
    it("returns empty trends when no completed scans exist", async () => {
      db.scan.findMany.mockResolvedValue([]);
      const result = await service.getTrends(ORG, { days: 90 });
      expect(result.trends).toEqual({});
      expect(result.meta.days).toBe(90);
      expect(result.meta).toHaveProperty("generatedAt");
    });

    it("queries scans with correct filters", async () => {
      db.scan.findMany.mockResolvedValue([]);
      await service.getTrends(ORG, { days: 30 });

      expect(db.scan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orgId: ORG,
            status: "completed",
            riskScore: { not: null },
          }),
          select: expect.objectContaining({
            projectId: true,
            riskScore: true,
            startedAt: true,
          }),
          orderBy: { startedAt: "asc" },
        }),
      );
    });

    it("groups scans by project and fills gaps", async () => {
      const today = new Date();
      const daysAgo = (n: number) => {
        const d = new Date(today);
        d.setDate(d.getDate() - n);
        return d;
      };

      db.scan.findMany.mockResolvedValue([
        { projectId: "p1", riskScore: 70, startedAt: daysAgo(5) },
        { projectId: "p1", riskScore: 60, startedAt: daysAgo(2) },
        { projectId: "p2", riskScore: 40, startedAt: daysAgo(3) },
      ]);

      const result = await service.getTrends(ORG, { days: 10 });

      expect(result.trends).toHaveProperty("p1");
      expect(result.trends).toHaveProperty("p2");
      expect(result.trends.p1.points.length).toBeGreaterThan(2);
      expect(result.trends.p1).toHaveProperty("direction");
      expect(result.trends.p1).toHaveProperty("changePercent");
      expect(result.trends.p2.points.length).toBeGreaterThan(1);
    });

    it("takes MAX risk score when multiple scans on same day", async () => {
      const today = new Date();
      const sameDay = new Date(today);
      sameDay.setDate(sameDay.getDate() - 5);

      db.scan.findMany.mockResolvedValue([
        { projectId: "p1", riskScore: 50, startedAt: new Date(sameDay) },
        { projectId: "p1", riskScore: 80, startedAt: new Date(sameDay) },
        { projectId: "p1", riskScore: 60, startedAt: new Date(sameDay) },
      ]);

      const result = await service.getTrends(ORG, { days: 10 });
      const firstPoint = result.trends.p1.points[0];
      expect(firstPoint.score).toBe(80);
    });

    it("defaults to 90 days", async () => {
      db.scan.findMany.mockResolvedValue([]);
      const result = await service.getTrends(ORG);
      expect(result.meta.days).toBe(90);
    });

    it("clamps days to max 365", async () => {
      db.scan.findMany.mockResolvedValue([]);
      const result = await service.getTrends(ORG, { days: 500 });
      expect(result.meta.days).toBe(365);
    });
  });
});
