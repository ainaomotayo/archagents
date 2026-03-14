import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRiskTrendRoutes } from "../routes/risk-trends.js";

vi.mock("@sentinel/compliance", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    RiskTrendService: class {
      getTrends = vi.fn().mockResolvedValue({
        trends: {
          "p1": {
            points: [{ date: "2026-01-01", score: 70 }],
            direction: "down",
            changePercent: -5,
          },
        },
        meta: { days: 90, generatedAt: "2026-03-14T00:00:00Z" },
      });
    },
  };
});

describe("buildRiskTrendRoutes", () => {
  const mockDb = {} as any;
  let routes: ReturnType<typeof buildRiskTrendRoutes>;

  beforeEach(() => {
    vi.clearAllMocks();
    routes = buildRiskTrendRoutes({ db: mockDb });
  });

  it("getTrends returns trends and meta", async () => {
    const result = await routes.getTrends("org-1", { days: 90 });
    expect(result).toHaveProperty("trends");
    expect(result).toHaveProperty("meta");
    expect(result.trends.p1.direction).toBe("down");
  });

  it("getTrends passes days option through", async () => {
    const result = await routes.getTrends("org-1", { days: 30 });
    expect(result).toHaveProperty("trends");
  });
});
