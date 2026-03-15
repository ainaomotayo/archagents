import { describe, it, expect } from "vitest";
import { renderDetailHtml } from "../../src/features/detail-html.js";

const baseFinding = {
  id: "f1", scanId: "s1", orgId: "o1", agentName: "security",
  type: "vulnerability", severity: "critical" as const, category: "vulnerability/sqli",
  file: "src/db.ts", lineStart: 42, lineEnd: 44,
  title: "SQL Injection", description: "User input flows into raw SQL query.",
  remediation: "Use parameterized queries instead of string concatenation.",
  cweId: "CWE-89", confidence: 0.95, suppressed: false, createdAt: "2026-03-15T10:00:00Z",
};

describe("DetailHTML", () => {
  it("renders severity badge", () => {
    const html = renderDetailHtml(baseFinding, {});
    expect(html).toContain("CRITICAL");
  });

  it("renders title and description", () => {
    const html = renderDetailHtml(baseFinding, {});
    expect(html).toContain("SQL Injection");
    expect(html).toContain("User input flows into raw SQL query");
  });

  it("renders remediation section", () => {
    const html = renderDetailHtml(baseFinding, {});
    expect(html).toContain("parameterized queries");
  });

  it("renders CWE link", () => {
    const html = renderDetailHtml(baseFinding, {});
    expect(html).toContain("CWE-89");
    expect(html).toContain("cwe.mitre.org");
  });

  it("renders agent and confidence", () => {
    const html = renderDetailHtml(baseFinding, {});
    expect(html).toContain("security");
    expect(html).toContain("95%");
  });

  it("renders compliance tags when provided", () => {
    const html = renderDetailHtml(baseFinding, {
      complianceTags: ["SOC 2 CC6.6", "NIST MS-2.5"],
    });
    expect(html).toContain("SOC 2 CC6.6");
    expect(html).toContain("NIST MS-2.5");
  });

  it("renders decision trace when provided", () => {
    const html = renderDetailHtml(baseFinding, {
      decisionTrace: {
        overallScore: 0.87,
        signals: [
          { category: "stylometric", weight: 0.6, confidence: 0.92 },
          { category: "timing", weight: 0.3, confidence: 0.78 },
        ],
      },
    });
    expect(html).toContain("Decision Trace");
    expect(html).toContain("stylometric");
    expect(html).toContain("87%");
  });

  it("omits decision trace section when not provided", () => {
    const html = renderDetailHtml(baseFinding, {});
    expect(html).not.toContain("Decision Trace");
  });

  it("renders action buttons", () => {
    const html = renderDetailHtml(baseFinding, {});
    expect(html).toContain("Suppress");
    expect(html).toContain("View in Dashboard");
  });

  it("renders code location section", () => {
    const html = renderDetailHtml(baseFinding, {});
    expect(html).toContain("Location");
    expect(html).toContain("42");
  });

  it("renders related findings when provided", () => {
    const related = { ...baseFinding, id: "f2", title: "Related XSS", severity: "high" as const, file: "src/api.ts", lineStart: 10, lineEnd: 10 };
    const html = renderDetailHtml(baseFinding, { relatedFindings: [related] });
    expect(html).toContain("Related Findings");
    expect(html).toContain("Related XSS");
  });
});
