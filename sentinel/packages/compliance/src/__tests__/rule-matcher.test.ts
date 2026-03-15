import { describe, it, expect } from "vitest";
import { matchFindings } from "../matchers/rule-matcher.js";
import type { MatchRule, FindingInput } from "../types.js";

const findings: FindingInput[] = [
  { id: "f1", agentName: "security", severity: "critical", category: "vulnerability/sql-injection", suppressed: false },
  { id: "f2", agentName: "security", severity: "high", category: "vulnerability/xss", suppressed: false },
  { id: "f3", agentName: "dependency", severity: "medium", category: "dependency/outdated", suppressed: false },
  { id: "f4", agentName: "ai-detector", severity: "low", category: "ai/generated", suppressed: false },
  { id: "f5", agentName: "security", severity: "critical", category: "vulnerability/rce", suppressed: true },
];

describe("matchFindings", () => {
  it("matches by category glob", () => {
    const rules: MatchRule[] = [{ category: "vulnerability/*" }];
    const matched = matchFindings(rules, findings);
    expect(matched.map((f) => f.id)).toEqual(["f1", "f2"]);
  });

  it("matches by agent name", () => {
    const rules: MatchRule[] = [{ agent: "dependency" }];
    const matched = matchFindings(rules, findings);
    expect(matched.map((f) => f.id)).toEqual(["f3"]);
  });

  it("matches by severity filter", () => {
    const rules: MatchRule[] = [{ severity: ["critical", "high"] }];
    const matched = matchFindings(rules, findings);
    expect(matched.map((f) => f.id)).toEqual(["f1", "f2"]);
  });

  it("combines agent + category + severity (AND logic)", () => {
    const rules: MatchRule[] = [{ agent: "security", category: "vulnerability/*", severity: ["critical"] }];
    const matched = matchFindings(rules, findings);
    expect(matched.map((f) => f.id)).toEqual(["f1"]);
  });

  it("unions multiple rules (OR across rules)", () => {
    const rules: MatchRule[] = [
      { agent: "security", severity: ["critical"] },
      { agent: "dependency" },
    ];
    const matched = matchFindings(rules, findings);
    expect(matched.map((f) => f.id)).toEqual(["f1", "f3"]);
  });

  it("excludes suppressed findings", () => {
    const rules: MatchRule[] = [{ category: "vulnerability/*", severity: ["critical"] }];
    const matched = matchFindings(rules, findings);
    expect(matched.map((f) => f.id)).toEqual(["f1"]);
    expect(matched.find((f) => f.id === "f5")).toBeUndefined();
  });

  it("returns empty for no matches", () => {
    const rules: MatchRule[] = [{ agent: "nonexistent" }];
    expect(matchFindings(rules, findings)).toEqual([]);
  });

  it("returns empty for empty rules", () => {
    expect(matchFindings([], findings)).toEqual([]);
  });

  it("negates match rule (returns non-matching findings)", () => {
    const rules: MatchRule[] = [{ category: "vulnerability/*", negate: true }];
    const matched = matchFindings(rules, findings);
    // f1, f2 are vulnerability/* → negated so excluded
    // f3 (dependency/outdated), f4 (ai/generated) → don't match → negated so included
    // f5 is suppressed → always excluded
    expect(matched.map((f) => f.id)).toEqual(["f3", "f4"]);
  });
});
