import { describe, it, expect } from "vitest";
import { MOCK_APPROVAL_GATES, MOCK_APPROVAL_STATS } from "@/lib/mock-data";

describe("MOCK_APPROVAL_GATES", () => {
  it("has 8 gates", () => {
    expect(MOCK_APPROVAL_GATES).toHaveLength(8);
  });

  it("has 2 escalated, 3 pending, 2 approved, 1 rejected", () => {
    const counts = { escalated: 0, pending: 0, approved: 0, rejected: 0, expired: 0 };
    for (const g of MOCK_APPROVAL_GATES) {
      counts[g.status]++;
    }
    expect(counts.escalated).toBe(2);
    expect(counts.pending).toBe(3);
    expect(counts.approved).toBe(2);
    expect(counts.rejected).toBe(1);
  });

  it("all gates have required fields", () => {
    for (const g of MOCK_APPROVAL_GATES) {
      expect(g.id).toBeTruthy();
      expect(g.scanId).toBeTruthy();
      expect(g.projectId).toBeTruthy();
      expect(g.projectName).toBeTruthy();
      expect(g.status).toBeTruthy();
      expect(g.gateType).toBeTruthy();
      expect(g.scan).toBeDefined();
      expect(g.scan.commitHash).toBeTruthy();
      expect(g.scan.branch).toBeTruthy();
      expect(typeof g.scan.riskScore).toBe("number");
      expect(typeof g.scan.findingCount).toBe("number");
      expect(Array.isArray(g.decisions)).toBe(true);
    }
  });

  it("decided gates have non-empty decisions", () => {
    const decided = MOCK_APPROVAL_GATES.filter(g => g.status === "approved" || g.status === "rejected");
    for (const g of decided) {
      expect(g.decisions.length).toBeGreaterThan(0);
      expect(g.decidedAt).toBeTruthy();
    }
  });

  it("pending/escalated gates have empty decisions", () => {
    const actionable = MOCK_APPROVAL_GATES.filter(g => g.status === "pending" || g.status === "escalated");
    for (const g of actionable) {
      expect(g.decisions).toHaveLength(0);
      expect(g.decidedAt).toBeNull();
    }
  });
});

describe("MOCK_APPROVAL_STATS", () => {
  it("has correct shape", () => {
    expect(typeof MOCK_APPROVAL_STATS.pending).toBe("number");
    expect(typeof MOCK_APPROVAL_STATS.escalated).toBe("number");
    expect(typeof MOCK_APPROVAL_STATS.decidedToday).toBe("number");
    expect(typeof MOCK_APPROVAL_STATS.avgDecisionTimeHours).toBe("number");
    expect(typeof MOCK_APPROVAL_STATS.expiringSoon).toBe("number");
  });
});
