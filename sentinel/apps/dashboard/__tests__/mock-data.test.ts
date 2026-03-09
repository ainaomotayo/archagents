import { describe, it, expect } from "vitest";
import {
  MOCK_CERTIFICATES,
  MOCK_FINDING_COUNTS_BY_CATEGORY,
  MOCK_FINDINGS,
  MOCK_OVERVIEW_STATS,
  MOCK_PROJECTS,
  MOCK_SCANS,
} from "@/lib/mock-data";

describe("Mock data shape validation", () => {
  it("MOCK_OVERVIEW_STATS has correct shape", () => {
    expect(typeof MOCK_OVERVIEW_STATS.totalScans).toBe("number");
    expect(typeof MOCK_OVERVIEW_STATS.activeRevocations).toBe("number");
    expect(typeof MOCK_OVERVIEW_STATS.openFindings).toBe("number");
    expect(typeof MOCK_OVERVIEW_STATS.passRate).toBe("number");
    expect(MOCK_OVERVIEW_STATS.passRate).toBeGreaterThanOrEqual(0);
    expect(MOCK_OVERVIEW_STATS.passRate).toBeLessThanOrEqual(100);
  });

  it("MOCK_PROJECTS have valid fields and unique IDs", () => {
    const ids = MOCK_PROJECTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const project of MOCK_PROJECTS) {
      expect(typeof project.name).toBe("string");
      expect(typeof project.findingCount).toBe("number");
      expect(typeof project.scanCount).toBe("number");
      if (project.lastScanStatus !== null) {
        expect(["pass", "fail", "provisional", "running"]).toContain(
          project.lastScanStatus,
        );
      }
    }
  });

  it("MOCK_SCANS reference valid project IDs", () => {
    const projectIds = new Set(MOCK_PROJECTS.map((p) => p.id));
    for (const scan of MOCK_SCANS) {
      expect(projectIds.has(scan.projectId)).toBe(true);
      expect(["pass", "fail", "provisional", "running"]).toContain(
        scan.status,
      );
      expect(scan.riskScore).toBeGreaterThanOrEqual(0);
      expect(scan.riskScore).toBeLessThanOrEqual(100);
    }
  });

  it("MOCK_FINDINGS have valid severities and statuses", () => {
    for (const finding of MOCK_FINDINGS) {
      expect(["critical", "high", "medium", "low"]).toContain(
        finding.severity,
      );
      expect(["open", "suppressed", "resolved"]).toContain(finding.status);
      expect(finding.confidence).toBeGreaterThanOrEqual(0);
      expect(finding.confidence).toBeLessThanOrEqual(100);
      expect(typeof finding.codeSnippet).toBe("string");
      expect(finding.codeSnippet.length).toBeGreaterThan(0);
    }
  });

  it("MOCK_CERTIFICATES have valid statuses and dates", () => {
    for (const cert of MOCK_CERTIFICATES) {
      expect(["active", "revoked", "expired"]).toContain(cert.status);
      expect(cert.riskScore).toBeGreaterThanOrEqual(0);
      // Revoked certs should have a revokedAt date
      if (cert.status === "revoked") {
        expect(cert.revokedAt).not.toBeNull();
      }
      // issuedAt should parse as a valid date
      expect(new Date(cert.issuedAt).getTime()).not.toBeNaN();
    }
  });

  it("MOCK_FINDING_COUNTS_BY_CATEGORY has non-negative counts", () => {
    expect(MOCK_FINDING_COUNTS_BY_CATEGORY.length).toBeGreaterThan(0);
    for (const fc of MOCK_FINDING_COUNTS_BY_CATEGORY) {
      expect(typeof fc.category).toBe("string");
      expect(fc.count).toBeGreaterThanOrEqual(0);
    }
  });
});
