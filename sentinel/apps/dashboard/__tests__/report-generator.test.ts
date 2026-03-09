import { describe, it, expect } from "vitest";
import { generateReportData, generateReportHtml } from "@/lib/report-generator";
import type { Scan, Finding, Certificate } from "@/lib/types";

const SCANS: Scan[] = [
  { id: "s1", projectId: "p1", commit: "abc", branch: "main", status: "pass", riskScore: 10, findingCount: 0, date: "2026-03-01T00:00:00Z" },
  { id: "s2", projectId: "p1", commit: "def", branch: "main", status: "fail", riskScore: 80, findingCount: 3, date: "2026-03-05T00:00:00Z" },
  { id: "s3", projectId: "p1", commit: "ghi", branch: "main", status: "pass", riskScore: 15, findingCount: 0, date: "2026-03-08T00:00:00Z" },
];

const FINDINGS: Finding[] = [
  { id: "f1", projectId: "p1", scanId: "s2", title: "Secret", description: "d", severity: "critical", confidence: 90, status: "open", category: "secret-detection", filePath: "a.ts", lineStart: 1, lineEnd: 1, codeSnippet: "", remediation: "", createdAt: "2026-03-05T00:00:00Z" },
  { id: "f2", projectId: "p1", scanId: "s2", title: "SQL Injection", description: "d", severity: "high", confidence: 85, status: "open", category: "security", filePath: "b.ts", lineStart: 1, lineEnd: 1, codeSnippet: "", remediation: "", createdAt: "2026-03-05T00:00:00Z" },
  { id: "f3", projectId: "p1", scanId: "s2", title: "Old dep", description: "d", severity: "medium", confidence: 99, status: "resolved", category: "dependency", filePath: "c.ts", lineStart: 1, lineEnd: 1, codeSnippet: "", remediation: "", createdAt: "2026-03-05T00:00:00Z" },
];

const CERTS: Certificate[] = [
  { id: "c1", projectId: "p1", scanId: "s1", commit: "abc", branch: "main", status: "active", riskScore: 10, issuedAt: "2026-03-01T00:00:00Z", expiresAt: "2026-04-01T00:00:00Z", revokedAt: null },
];

describe("generateReportData", () => {
  it("calculates pass rate correctly", () => {
    const data = generateReportData(SCANS, FINDINGS, CERTS);
    // 2 out of 3 pass => 67%
    expect(data.summary.passRate).toBe(67);
  });

  it("computes period from scan dates", () => {
    const data = generateReportData(SCANS, FINDINGS, CERTS);
    expect(data.period.start).toContain("2026-03-01");
    expect(data.period.end).toContain("2026-03-08");
  });

  it("aggregates open findings by category", () => {
    const data = generateReportData(SCANS, FINDINGS, CERTS);
    // Only open findings: secret-detection (1) and security (1)
    expect(data.summary.topFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "secret-detection", count: 1 }),
        expect.objectContaining({ category: "security", count: 1 }),
      ]),
    );
    // Resolved finding should not appear
    const depCategory = data.summary.topFindings.find((f) => f.category === "dependency");
    expect(depCategory).toBeUndefined();
  });

  it("identifies compliance gaps for critical findings", () => {
    const data = generateReportData(SCANS, FINDINGS, CERTS);
    expect(data.compliance.euAiAct.compliant).toBe(false);
    expect(data.compliance.euAiAct.gaps).toContain("Critical findings remain unresolved");
  });

  it("returns compliant when no open findings", () => {
    const noOpenFindings = FINDINGS.map((f) => ({ ...f, status: "resolved" as const }));
    const data = generateReportData(SCANS, noOpenFindings, CERTS);
    expect(data.compliance.euAiAct.compliant).toBe(true);
    expect(data.compliance.euAiAct.gaps).toHaveLength(0);
  });

  it("handles empty scans gracefully", () => {
    const data = generateReportData([], [], []);
    expect(data.summary.totalScans).toBe(0);
    expect(data.summary.passRate).toBe(0);
    expect(data.summary.riskTrend).toBe("stable");
  });
});

describe("generateReportHtml", () => {
  it("returns valid HTML with DOCTYPE", () => {
    const data = generateReportData(SCANS, FINDINGS, CERTS);
    const html = generateReportHtml(data);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("includes organization name", () => {
    const data = generateReportData(SCANS, FINDINGS, CERTS, "TestOrg");
    const html = generateReportHtml(data);
    expect(html).toContain("TestOrg");
  });

  it("includes print-optimized CSS", () => {
    const data = generateReportData(SCANS, FINDINGS, CERTS);
    const html = generateReportHtml(data);
    expect(html).toContain("@media print");
  });

  it("includes SOC 2 control rows", () => {
    const data = generateReportData(SCANS, FINDINGS, CERTS);
    const html = generateReportHtml(data);
    expect(html).toContain("CC6.1");
    expect(html).toContain("CC7.2");
  });
});
