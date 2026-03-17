import { describe, it, expect } from "vitest";
import { FindingsTreeProvider, SeverityGroup, FindingItem } from "../../src/features/tree-view.js";

const makeFinding = (id: string, severity: string, title: string, file: string, line: number) => ({
  id, scanId: "s1", orgId: "o1", agentName: "security", type: "vulnerability",
  severity, category: null, file, lineStart: line, lineEnd: line,
  title, description: null, remediation: null, cweId: null,
  confidence: 0.9, suppressed: false, createdAt: "2026-01-01",
});

describe("FindingsTreeProvider", () => {
  it("groups findings by severity", () => {
    const provider = new FindingsTreeProvider();
    provider.updateFindings([
      makeFinding("1", "critical", "SQLi", "a.ts", 1),
      makeFinding("2", "high", "XSS", "b.ts", 2),
      makeFinding("3", "critical", "RCE", "c.ts", 3),
    ]);
    const roots = provider.getChildren(undefined);
    expect(roots).toHaveLength(2);
    expect(roots[0]).toBeInstanceOf(SeverityGroup);
    expect((roots[0] as SeverityGroup).severity).toBe("critical");
    expect((roots[0] as SeverityGroup).count).toBe(2);
    expect((roots[1] as SeverityGroup).severity).toBe("high");
  });

  it("returns findings as children of severity group", () => {
    const provider = new FindingsTreeProvider();
    provider.updateFindings([
      makeFinding("1", "critical", "SQLi", "a.ts", 10),
      makeFinding("2", "critical", "RCE", "b.ts", 20),
    ]);
    const roots = provider.getChildren(undefined);
    const children = provider.getChildren(roots[0]);
    expect(children).toHaveLength(2);
    expect(children[0]).toBeInstanceOf(FindingItem);
  });

  it("sorts findings by confidence descending within group", () => {
    const provider = new FindingsTreeProvider();
    const f1 = { ...makeFinding("1", "high", "Low conf", "a.ts", 1), confidence: 0.5 };
    const f2 = { ...makeFinding("2", "high", "High conf", "b.ts", 2), confidence: 0.95 };
    provider.updateFindings([f1, f2]);
    const roots = provider.getChildren(undefined);
    const children = provider.getChildren(roots[0]);
    expect((children[0] as FindingItem).finding.id).toBe("2");
  });

  it("filters by severity threshold", () => {
    const provider = new FindingsTreeProvider();
    provider.updateFindings([
      makeFinding("1", "critical", "A", "a.ts", 1),
      makeFinding("2", "low", "B", "b.ts", 2),
      makeFinding("3", "info", "C", "c.ts", 3),
    ]);
    provider.setSeverityThreshold("medium");
    const roots = provider.getChildren(undefined);
    expect(roots).toHaveLength(1); // only critical
    expect((roots[0] as SeverityGroup).severity).toBe("critical");
  });

  it("empty findings returns empty array", () => {
    const provider = new FindingsTreeProvider();
    expect(provider.getChildren(undefined)).toHaveLength(0);
  });

  it("badge reflects total count", () => {
    const provider = new FindingsTreeProvider();
    provider.updateFindings([
      makeFinding("1", "critical", "A", "a.ts", 1),
      makeFinding("2", "high", "B", "b.ts", 2),
    ]);
    expect(provider.totalCount).toBe(2);
  });
});
