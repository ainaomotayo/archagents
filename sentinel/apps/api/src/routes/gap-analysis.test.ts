import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  finding: { findMany: vi.fn().mockResolvedValue([]) },
  controlAttestation: { findMany: vi.fn().mockResolvedValue([]) },
  remediationItem: { findMany: vi.fn().mockResolvedValue([]) },
};

vi.mock("@sentinel/db", () => ({
  getDb: () => mockDb,
  withTenant: (_db: any, _orgId: string, fn: any) => fn(mockDb),
  disconnectDb: vi.fn(),
}));

import { buildGapAnalysisRoutes } from "./gap-analysis.js";

describe("buildGapAnalysisRoutes", () => {
  let routes: ReturnType<typeof buildGapAnalysisRoutes>;

  beforeEach(() => {
    vi.clearAllMocks();
    routes = buildGapAnalysisRoutes({ db: mockDb as any });
  });

  it("computes gap analysis for known framework", async () => {
    const result = await routes.computeGaps("org-1", "hipaa");
    expect(result).toHaveProperty("frameworkSlug", "hipaa");
    expect(result).toHaveProperty("gaps");
    expect(result).toHaveProperty("summary");
    expect(result.summary).toHaveProperty("compliant");
    expect(result.summary).toHaveProperty("nonCompliant");
  });

  it("computes gap analysis for soc2 framework", async () => {
    const result = await routes.computeGaps("org-1", "soc2");
    expect(result).toHaveProperty("frameworkSlug", "soc2");
    expect(result).toHaveProperty("overallScore");
    expect(result).toHaveProperty("remediationPlan");
  });

  it("rejects unknown framework", async () => {
    await expect(routes.computeGaps("org-1", "nonexistent")).rejects.toThrow("Unknown framework");
  });

  it("passes attestations and remediations to gap analysis", async () => {
    mockDb.controlAttestation.findMany.mockResolvedValue([
      { controlCode: "TS-1.4", status: "attested", attestedAt: new Date() },
    ]);
    mockDb.remediationItem.findMany.mockResolvedValue([
      { controlCode: "TS-1.4", status: "in_progress" },
    ]);

    const result = await routes.computeGaps("org-1", "hipaa");
    expect(result).toHaveProperty("frameworkSlug", "hipaa");
    expect(mockDb.controlAttestation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: "org-1", frameworkSlug: "hipaa" }) }),
    );
  });
});
