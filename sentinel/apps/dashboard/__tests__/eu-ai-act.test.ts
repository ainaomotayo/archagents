import { describe, it, expect } from "vitest";
import {
  EU_AI_ACT_REQUIREMENTS,
  assessCompliance,
} from "@/lib/eu-ai-act";
import type { Scan, Certificate } from "@/lib/types";

const makeScans = (overrides: Partial<Scan>[] = []): Scan[] =>
  overrides.map((o, i) => ({
    id: `s${i}`,
    projectId: "p1",
    commit: `c${i}`,
    branch: "main",
    status: "pass" as const,
    riskScore: 10,
    findingCount: 0,
    date: `2026-03-0${i + 1}T00:00:00Z`,
    ...o,
  }));

const makeCerts = (overrides: Partial<Certificate>[] = []): Certificate[] =>
  overrides.map((o, i) => ({
    id: `cert-${i}`,
    projectId: "p1",
    scanId: `s${i}`,
    commit: `c${i}`,
    branch: "main",
    status: "active" as const,
    riskScore: 10,
    issuedAt: "2026-03-01T00:00:00Z",
    expiresAt: "2026-04-01T00:00:00Z",
    revokedAt: null,
    ...o,
  }));

describe("EU_AI_ACT_REQUIREMENTS", () => {
  it("contains all 7 key articles", () => {
    const articles = EU_AI_ACT_REQUIREMENTS.map((r) => r.article);
    expect(articles).toContain("Art. 9");
    expect(articles).toContain("Art. 10");
    expect(articles).toContain("Art. 11");
    expect(articles).toContain("Art. 12");
    expect(articles).toContain("Art. 13");
    expect(articles).toContain("Art. 14");
    expect(articles).toContain("Art. 15");
  });

  it("has sentinelMapping for every requirement", () => {
    for (const req of EU_AI_ACT_REQUIREMENTS) {
      expect(req.sentinelMapping.length).toBeGreaterThan(0);
    }
  });
});

describe("assessCompliance", () => {
  it("returns 100% when all conditions are met", () => {
    const scans = makeScans([
      { status: "pass", riskScore: 10 },
      { status: "pass", riskScore: 5 },
      { status: "pass", riskScore: 8 },
    ]);
    const certs = makeCerts([{ status: "active" }]);
    const result = assessCompliance(scans, certs);
    expect(result.compliant).toBe(true);
    expect(result.complianceScore).toBe(100);
  });

  it("marks Art. 9 partial when pass rate < 70%", () => {
    const scans = makeScans([
      { status: "pass", riskScore: 10 },
      { status: "fail", riskScore: 80 },
      { status: "fail", riskScore: 75 },
    ]);
    const certs = makeCerts([{ status: "active" }]);
    const result = assessCompliance(scans, certs);
    const art9 = result.requirements.find((r) => r.article === "Art. 9");
    expect(art9?.status).toBe("partial");
  });

  it("marks Art. 11 partial when no active certificates", () => {
    const scans = makeScans([{ status: "pass", riskScore: 10 }]);
    const certs = makeCerts([{ status: "revoked" }]);
    const result = assessCompliance(scans, certs);
    const art11 = result.requirements.find((r) => r.article === "Art. 11");
    expect(art11?.status).toBe("partial");
  });

  it("marks Art. 15 partial when high-risk scans exist", () => {
    const scans = makeScans([
      { status: "pass", riskScore: 10 },
      { status: "fail", riskScore: 85 },
    ]);
    const certs = makeCerts([{ status: "active" }]);
    const result = assessCompliance(scans, certs);
    const art15 = result.requirements.find((r) => r.article === "Art. 15");
    expect(art15?.status).toBe("partial");
  });

  it("handles empty inputs gracefully", () => {
    const result = assessCompliance([], []);
    expect(result.compliant).toBe(false);
    expect(result.complianceScore).toBeLessThan(100);
  });
});
