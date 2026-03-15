import { describe, it, expect } from "vitest";
import { computeGutterRanges } from "../../src/features/gutter-icons.js";

describe("GutterIcons", () => {
  it("groups diagnostics by line and picks max severity", () => {
    const diagnostics = [
      { range: { start: { line: 5 }, end: { line: 5 } }, source: "sentinel/security", severity: 0 },
      { range: { start: { line: 5 }, end: { line: 5 } }, source: "sentinel/quality", severity: 1 },
      { range: { start: { line: 10 }, end: { line: 10 } }, source: "sentinel/dep", severity: 1 },
    ];
    const result = computeGutterRanges(diagnostics as any);
    expect(result.get("critical")).toHaveLength(1);
    expect(result.get("critical")![0].start.line).toBe(5);
    expect(result.get("high")).toHaveLength(1);
    expect(result.get("high")![0].start.line).toBe(10);
  });

  it("filters non-sentinel diagnostics", () => {
    const diagnostics = [
      { range: { start: { line: 1 }, end: { line: 1 } }, source: "eslint", severity: 0 },
      { range: { start: { line: 2 }, end: { line: 2 } }, source: "sentinel/security", severity: 1 },
    ];
    const result = computeGutterRanges(diagnostics as any);
    const total = Array.from(result.values()).reduce((sum, arr) => sum + arr.length, 0);
    expect(total).toBe(1);
  });

  it("returns empty map for no diagnostics", () => {
    const result = computeGutterRanges([]);
    expect(result.size).toBe(0);
  });

  it("maps DiagnosticSeverity numbers to severity strings", () => {
    const diagnostics = [
      { range: { start: { line: 1 }, end: { line: 1 } }, source: "sentinel/a", severity: 0 },
      { range: { start: { line: 2 }, end: { line: 2 } }, source: "sentinel/b", severity: 1 },
      { range: { start: { line: 3 }, end: { line: 3 } }, source: "sentinel/c", severity: 2 },
      { range: { start: { line: 4 }, end: { line: 4 } }, source: "sentinel/d", severity: 3 },
    ];
    const result = computeGutterRanges(diagnostics as any);
    expect(result.has("critical")).toBe(true);
    expect(result.has("high")).toBe(true);
    expect(result.has("low")).toBe(true);
    expect(result.has("info")).toBe(true);
  });
});
