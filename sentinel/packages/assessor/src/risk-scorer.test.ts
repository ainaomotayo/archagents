import { describe, it, expect } from "vitest";
import { calculateRiskScore, determineStatus } from "./risk-scorer.js";
import type { Finding, AgentResult, FindingType, CategoryScore } from "@sentinel/shared";

// ---------------------------------------------------------------------------
// Helpers to create test data
// ---------------------------------------------------------------------------

function makeFinding(
  type: FindingType,
  severity: Finding["severity"],
): Finding {
  return {
    type: "security",
    file: "test.ts",
    lineStart: 1,
    lineEnd: 2,
    severity,
    confidence: "high",
    category: "test",
    title: "Test finding",
    description: "desc",
    remediation: "fix it",
    scanner: "semgrep",
    cweId: null,
    // Override type via spread so TS is happy for non-security types
    ...({ type } as Partial<Finding>),
  } as Finding;
}

function emptyCategories(): Record<FindingType, CategoryScore> {
  const empty: CategoryScore = {
    score: 0,
    status: "pass",
    findings: { critical: 0, high: 0, medium: 0, low: 0 },
  };
  return {
    security: { ...empty },
    license: { ...empty },
    quality: { ...empty },
    policy: { ...empty },
    dependency: { ...empty },
    "ai-detection": { ...empty },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("calculateRiskScore", () => {
  it("returns 0 for no findings", () => {
    const result = calculateRiskScore({ findings: [], agentResults: [] });
    expect(result.score).toBe(0);
    expect(result.categories.security.score).toBe(0);
    expect(result.categories.security.status).toBe("pass");
  });

  it("weights critical findings heavily", () => {
    const findings = [makeFinding("security", "critical")];
    const result = calculateRiskScore({ findings, agentResults: [] });
    // 1 critical security = 40 raw, 40 * 0.30 = 12 weighted
    expect(result.score).toBe(12);
    expect(result.categories.security.findings.critical).toBe(1);
    expect(result.categories.security.status).toBe("fail");
  });

  it("aggregates across multiple categories", () => {
    const findings = [
      makeFinding("security", "high"),   // 15 * 0.30 = 4.5
      makeFinding("license", "medium"),  // 5 * 0.20 = 1.0
      makeFinding("quality", "low"),     // 1 * 0.15 = 0.15
    ];
    const result = calculateRiskScore({ findings, agentResults: [] });
    expect(result.score).toBe(6); // rounded
  });

  it("caps individual category scores at 100", () => {
    // 3 critical security findings = 120 raw, capped to 100
    const findings = [
      makeFinding("security", "critical"),
      makeFinding("security", "critical"),
      makeFinding("security", "critical"),
    ];
    const result = calculateRiskScore({ findings, agentResults: [] });
    expect(result.categories.security.score).toBe(100);
    // 100 * 0.30 = 30
    expect(result.score).toBe(30);
  });

  it("ignores info severity findings", () => {
    const findings = [makeFinding("security", "info")];
    const result = calculateRiskScore({ findings, agentResults: [] });
    expect(result.score).toBe(0);
  });
});

describe("determineStatus", () => {
  it("returns full_pass when score < 30 and no critical", () => {
    const cats = emptyCategories();
    expect(determineStatus(10, cats, false)).toBe("full_pass");
  });

  it("returns provisional_pass when 30 <= score < 60 and no critical", () => {
    const cats = emptyCategories();
    expect(determineStatus(45, cats, false)).toBe("provisional_pass");
  });

  it("returns fail when score >= 60", () => {
    const cats = emptyCategories();
    expect(determineStatus(60, cats, false)).toBe("fail");
  });

  it("returns fail when any category has critical findings", () => {
    const cats = emptyCategories();
    cats.security.findings.critical = 1;
    expect(determineStatus(10, cats, false)).toBe("fail");
  });

  it("returns partial when agents timed out and no critical and score < 60", () => {
    const cats = emptyCategories();
    expect(determineStatus(25, cats, true)).toBe("partial");
  });

  it("returns fail over partial when critical findings exist with timeouts", () => {
    const cats = emptyCategories();
    cats.license.findings.critical = 1;
    expect(determineStatus(25, cats, true)).toBe("fail");
  });
});
