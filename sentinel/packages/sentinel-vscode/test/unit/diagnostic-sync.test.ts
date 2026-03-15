import { describe, it, expect } from "vitest";
import { extractFindingsFromDiagnostics } from "../../src/features/tree-view.js";

describe("Diagnostic sync", () => {
  it("extracts finding data from diagnostic.data", () => {
    const diag = {
      source: "sentinel/security",
      severity: 0,
      message: "SQL Injection",
      range: { start: { line: 5, character: 0 }, end: { line: 5, character: 100 } },
      code: "CWE-89",
      data: {
        findingId: "f-123",
        finding: {
          id: "f-123", severity: "critical", title: "SQL Injection",
          file: "src/db.ts", lineStart: 6, lineEnd: 6, agentName: "security",
          confidence: 0.95, category: "vulnerability/sqli",
        },
      },
    };
    const findings = extractFindingsFromDiagnostics([diag as any]);
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe("f-123");
  });

  it("skips non-sentinel diagnostics", () => {
    const diag = { source: "eslint", severity: 1, message: "no-var", range: { start: { line: 0 }, end: { line: 0 } } };
    const findings = extractFindingsFromDiagnostics([diag as any]);
    expect(findings).toHaveLength(0);
  });
});
