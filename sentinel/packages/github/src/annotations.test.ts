import { describe, it, expect } from "vitest";
import { findingsToAnnotations, type CheckAnnotation } from "./annotations.js";
import type { Finding, SecurityFinding, QualityFinding, LicenseFinding } from "@sentinel/shared";

// ── Helpers ──

function makeSecurityFinding(
  overrides: Partial<SecurityFinding> = {},
): SecurityFinding {
  return {
    type: "security",
    file: "src/auth.ts",
    lineStart: 10,
    lineEnd: 15,
    severity: "high",
    confidence: "high",
    category: "injection",
    title: "SQL Injection",
    description: "Unsanitized input passed to query",
    remediation: "Use parameterized queries",
    scanner: "semgrep",
    cweId: "CWE-89",
    ...overrides,
  };
}

function makeQualityFinding(
  overrides: Partial<QualityFinding> = {},
): QualityFinding {
  return {
    type: "quality",
    file: "src/utils.ts",
    lineStart: 1,
    lineEnd: 50,
    severity: "low",
    confidence: "medium",
    metric: "complexity",
    score: 25,
    detail: "Cyclomatic complexity of 25 exceeds threshold of 10",
    suggestion: "Extract helper functions",
    ...overrides,
  };
}

function makeLicenseFinding(
  overrides: Partial<LicenseFinding> = {},
): LicenseFinding {
  return {
    type: "license",
    file: "vendor/lib.js",
    lineStart: 1,
    lineEnd: 1,
    severity: "medium",
    confidence: "high",
    findingType: "copyleft-risk",
    licenseDetected: "GPL-3.0",
    similarityScore: 0.95,
    sourceMatch: "some-gpl-lib",
    policyAction: "block",
    ...overrides,
  };
}

// ── Tests ──

describe("findingsToAnnotations", () => {
  it("returns empty array for empty findings", () => {
    expect(findingsToAnnotations([])).toEqual([]);
  });

  it("maps critical severity to failure annotation_level", () => {
    const findings: Finding[] = [makeSecurityFinding({ severity: "critical" })];
    const annotations = findingsToAnnotations(findings);

    expect(annotations).toHaveLength(1);
    expect(annotations[0].annotation_level).toBe("failure");
  });

  it("maps high severity to failure annotation_level", () => {
    const annotations = findingsToAnnotations([makeSecurityFinding({ severity: "high" })]);
    expect(annotations[0].annotation_level).toBe("failure");
  });

  it("maps medium severity to warning annotation_level", () => {
    const annotations = findingsToAnnotations([makeLicenseFinding({ severity: "medium" })]);
    expect(annotations[0].annotation_level).toBe("warning");
  });

  it("maps low severity to notice annotation_level", () => {
    const annotations = findingsToAnnotations([makeQualityFinding({ severity: "low" })]);
    expect(annotations[0].annotation_level).toBe("notice");
  });

  it("maps info severity to notice annotation_level", () => {
    const annotations = findingsToAnnotations([makeQualityFinding({ severity: "info" })]);
    expect(annotations[0].annotation_level).toBe("notice");
  });

  it("sets correct path and line info from finding", () => {
    const annotations = findingsToAnnotations([
      makeSecurityFinding({ file: "lib/db.ts", lineStart: 42, lineEnd: 48 }),
    ]);

    expect(annotations[0].path).toBe("lib/db.ts");
    expect(annotations[0].start_line).toBe(42);
    expect(annotations[0].end_line).toBe(48);
  });

  it("builds title with severity and type info for security findings", () => {
    const annotations = findingsToAnnotations([makeSecurityFinding()]);
    expect(annotations[0].title).toBe("[HIGH] SQL Injection");
  });

  it("builds title for license findings", () => {
    const annotations = findingsToAnnotations([makeLicenseFinding()]);
    expect(annotations[0].title).toContain("License");
    expect(annotations[0].title).toContain("copyleft-risk");
  });

  it("builds title for quality findings", () => {
    const annotations = findingsToAnnotations([makeQualityFinding()]);
    expect(annotations[0].title).toContain("Quality");
    expect(annotations[0].title).toContain("complexity");
  });

  it("includes remediation in security finding message", () => {
    const annotations = findingsToAnnotations([makeSecurityFinding()]);
    expect(annotations[0].message).toContain("Remediation:");
    expect(annotations[0].message).toContain("parameterized queries");
  });

  it("truncates annotations at 50 (GitHub limit)", () => {
    const findings: Finding[] = Array.from({ length: 60 }, (_, i) =>
      makeSecurityFinding({ lineStart: i, lineEnd: i + 1 }),
    );
    const annotations = findingsToAnnotations(findings);
    expect(annotations).toHaveLength(50);
  });

  it("handles mixed finding types", () => {
    const findings: Finding[] = [
      makeSecurityFinding(),
      makeLicenseFinding(),
      makeQualityFinding(),
    ];
    const annotations = findingsToAnnotations(findings);

    expect(annotations).toHaveLength(3);
    expect(annotations[0].annotation_level).toBe("failure"); // high security
    expect(annotations[1].annotation_level).toBe("warning"); // medium license
    expect(annotations[2].annotation_level).toBe("notice"); // low quality
  });
});
