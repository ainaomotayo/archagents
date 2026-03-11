import { describe, it, expect } from "vitest";
import {
  DiagnosticSeverity,
  CodeActionKind,
} from "vscode-languageserver";
import { DiagnosticMapper } from "../diagnostic-mapper.js";
import type { SentinelFinding } from "../types.js";

function makeFinding(overrides: Partial<SentinelFinding> = {}): SentinelFinding {
  return {
    id: "f-1",
    scanId: "s-1",
    orgId: "org-1",
    agentName: "security",
    type: "vulnerability",
    severity: "medium",
    category: "injection",
    file: "src/app.ts",
    lineStart: 10,
    lineEnd: 12,
    title: "SQL Injection detected",
    description: "User input flows into SQL query",
    remediation: "Use parameterized queries",
    cweId: "CWE-89",
    confidence: 0.95,
    suppressed: false,
    createdAt: "2026-03-10T00:00:00Z",
    ...overrides,
  };
}

describe("DiagnosticMapper", () => {
  const mapper = new DiagnosticMapper();

  it("maps critical severity to DiagnosticSeverity.Error", () => {
    const finding = makeFinding({ severity: "critical" });
    const diag = mapper.toDiagnostic(finding);
    expect(diag.severity).toBe(DiagnosticSeverity.Error);
  });

  it("maps medium severity to DiagnosticSeverity.Warning", () => {
    const finding = makeFinding({ severity: "medium" });
    const diag = mapper.toDiagnostic(finding);
    expect(diag.severity).toBe(DiagnosticSeverity.Warning);
  });

  it("maps info severity to DiagnosticSeverity.Hint", () => {
    const finding = makeFinding({ severity: "info" });
    const diag = mapper.toDiagnostic(finding);
    expect(diag.severity).toBe(DiagnosticSeverity.Hint);
  });

  it('sets source to "sentinel/{agentName}"', () => {
    const finding = makeFinding({ agentName: "dependency" });
    const diag = mapper.toDiagnostic(finding);
    expect(diag.source).toBe("sentinel/dependency");
  });

  it("uses CWE ID as code when present", () => {
    const finding = makeFinding({ cweId: "CWE-89" });
    const diag = mapper.toDiagnostic(finding);
    expect(diag.code).toBe("CWE-89");
  });

  it("falls back to category when no CWE", () => {
    const finding = makeFinding({ cweId: null, category: "injection" });
    const diag = mapper.toDiagnostic(finding);
    expect(diag.code).toBe("injection");
  });

  it("sets correct line range (1-indexed finding -> 0-indexed LSP) with full-line highlight", () => {
    const finding = makeFinding({ lineStart: 10, lineEnd: 12 });
    const diag = mapper.toDiagnostic(finding);
    expect(diag.range.start.line).toBe(9);
    expect(diag.range.end.line).toBe(11);
    expect(diag.range.start.character).toBe(0);
    expect(diag.range.end.character).toBe(Number.MAX_VALUE);
  });

  it("includes findingId in diagnostic data", () => {
    const finding = makeFinding({ id: "f-42" });
    const diag = mapper.toDiagnostic(finding);
    expect(diag.data).toEqual({ findingId: "f-42" });
  });

  it("toCodeActions returns suppress and view actions (2 actions)", () => {
    const finding = makeFinding();
    const actions = mapper.toCodeActions(finding);
    expect(actions).toHaveLength(2);
    expect(actions[0].title).toContain("Suppress");
    expect(actions[1].title).toBe("View in Sentinel Dashboard");
  });

  it("suppress action has kind QuickFix", () => {
    const finding = makeFinding();
    const actions = mapper.toCodeActions(finding);
    expect(actions[0].kind).toBe(CodeActionKind.QuickFix);
    expect(actions[1].kind).toBe(CodeActionKind.QuickFix);
  });

  it("code actions include linked diagnostics", () => {
    const finding = makeFinding();
    const actions = mapper.toCodeActions(finding);
    expect(actions[0].diagnostics).toHaveLength(1);
    expect(actions[0].diagnostics![0].data).toEqual({ findingId: finding.id });
    expect(actions[1].diagnostics).toHaveLength(1);
  });

  it("toCodeLenses groups findings by first line, shows count and max severity", () => {
    const findings = [
      makeFinding({ id: "f-1", lineStart: 10, severity: "medium" }),
      makeFinding({ id: "f-2", lineStart: 10, severity: "critical" }),
      makeFinding({ id: "f-3", lineStart: 20, severity: "low" }),
    ];
    const lenses = mapper.toCodeLenses(findings);
    expect(lenses).toHaveLength(2);

    // First group: line 10 with 2 findings, max severity critical
    const lens10 = lenses.find((l) => l.range.start.line === 9)!;
    expect(lens10).toBeDefined();
    expect(lens10.command!.title).toContain("2");
    expect(lens10.command!.title).toContain("critical");
    expect(lens10.command!.title).toMatch(/\$\(warning\)/);
    // Arguments should be array of finding IDs
    expect(lens10.command!.arguments![0]).toEqual(["f-1", "f-2"]);

    // Second group: line 20 with 1 finding, max severity low
    const lens20 = lenses.find((l) => l.range.start.line === 19)!;
    expect(lens20).toBeDefined();
    expect(lens20.command!.title).toContain("1");
    expect(lens20.command!.title).toContain("low");
    expect(lens20.command!.arguments![0]).toEqual(["f-3"]);
  });
});
