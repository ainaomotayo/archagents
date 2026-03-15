import { describe, it, expect } from "vitest";
import { compileToPredicates } from "../src/compile-predicates.js";
import type { GroupNode, PolicyInput } from "../src/types.js";

describe("compileToPredicates", () => {
  // 1. AND group with all-matching conditions returns true
  it("AND group with all-matching conditions returns true", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["critical", "high"] } },
        { id: "a1", type: "action", actionType: "block", config: {} },
      ],
    };
    const predicate = compileToPredicates(tree);
    const result = predicate({ severity: "critical" });
    expect(result.match).toBe(true);
  });

  // 2. AND group short-circuits on first non-match
  it("AND group short-circuits on first non-match", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["critical"] } },
        { id: "c2", type: "condition", conditionType: "category", config: { categories: ["xss"] } },
        { id: "a1", type: "action", actionType: "block", config: {} },
      ],
    };
    const predicate = compileToPredicates(tree);
    const result = predicate({ severity: "low", category: "xss" });
    expect(result.match).toBe(false);
    // c2 and a1 should not appear in trace (short-circuited by AND)
    const traceIds = result.trace.map((t) => t.nodeId);
    expect(traceIds).toContain("c1");
    expect(traceIds).not.toContain("c2");
    expect(traceIds).not.toContain("a1");
  });

  // 3. OR group with one matching returns true
  it("OR group with one matching condition returns true", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "OR",
      children: [
        { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["critical"] } },
        { id: "c2", type: "condition", conditionType: "severity", config: { severities: ["high"] } },
      ],
    };
    const predicate = compileToPredicates(tree);
    const result = predicate({ severity: "high" });
    expect(result.match).toBe(true);
  });

  // 4. OR group short-circuits on first match
  it("OR group short-circuits on first match", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "OR",
      children: [
        { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["critical"] } },
        { id: "c2", type: "condition", conditionType: "severity", config: { severities: ["high"] } },
      ],
    };
    const predicate = compileToPredicates(tree);
    const result = predicate({ severity: "critical" });
    expect(result.match).toBe(true);
    const c2Trace = result.trace.find((t) => t.nodeId === "c2");
    expect(c2Trace?.shortCircuited).toBe(true);
  });

  // 5. NOT group negates match
  it("NOT group negates a match to false", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "NOT",
      children: [
        { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["critical"] } },
      ],
    };
    const predicate = compileToPredicates(tree);
    const result = predicate({ severity: "critical" });
    expect(result.match).toBe(false);
  });

  // 6. NOT group negates non-match
  it("NOT group negates a non-match to true", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "NOT",
      children: [
        { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["critical"] } },
      ],
    };
    const predicate = compileToPredicates(tree);
    const result = predicate({ severity: "low" });
    expect(result.match).toBe(true);
  });

  // 7. severity condition matches when severity in list
  it("severity condition matches when severity is in the list", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["critical", "high"] } },
        { id: "a1", type: "action", actionType: "block", config: {} },
      ],
    };
    const predicate = compileToPredicates(tree);
    expect(predicate({ severity: "high" }).match).toBe(true);
  });

  // 8. severity condition fails when severity not in list
  it("severity condition fails when severity is not in the list", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["critical", "high"] } },
        { id: "a1", type: "action", actionType: "block", config: {} },
      ],
    };
    const predicate = compileToPredicates(tree);
    expect(predicate({ severity: "low" }).match).toBe(false);
  });

  // 9. category condition matches
  it("category condition matches when category is in the list", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "c1", type: "condition", conditionType: "category", config: { categories: ["xss", "sqli"] } },
        { id: "a1", type: "action", actionType: "block", config: {} },
      ],
    };
    const predicate = compileToPredicates(tree);
    expect(predicate({ category: "sqli" }).match).toBe(true);
  });

  // 10. risk-score condition "gt" operator
  it("risk-score condition with gt operator", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "c1", type: "condition", conditionType: "risk-score", config: { operator: "gt", value: 70 } },
        { id: "a1", type: "action", actionType: "block", config: {} },
      ],
    };
    const predicate = compileToPredicates(tree);
    expect(predicate({ riskScore: 80 }).match).toBe(true);
    expect(predicate({ riskScore: 70 }).match).toBe(false);
    expect(predicate({ riskScore: 50 }).match).toBe(false);
  });

  // 11. risk-score condition "lt" operator
  it("risk-score condition with lt operator", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "c1", type: "condition", conditionType: "risk-score", config: { operator: "lt", value: 30 } },
        { id: "a1", type: "action", actionType: "block", config: {} },
      ],
    };
    const predicate = compileToPredicates(tree);
    expect(predicate({ riskScore: 10 }).match).toBe(true);
    expect(predicate({ riskScore: 30 }).match).toBe(false);
    expect(predicate({ riskScore: 50 }).match).toBe(false);
  });

  // 12. risk-score condition "between" operator
  it("risk-score condition with between operator", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "c1", type: "condition", conditionType: "risk-score", config: { operator: "between", value: 30, upperBound: 70 } },
        { id: "a1", type: "action", actionType: "block", config: {} },
      ],
    };
    const predicate = compileToPredicates(tree);
    expect(predicate({ riskScore: 50 }).match).toBe(true);
    expect(predicate({ riskScore: 30 }).match).toBe(true);
    expect(predicate({ riskScore: 70 }).match).toBe(true);
    expect(predicate({ riskScore: 10 }).match).toBe(false);
    expect(predicate({ riskScore: 80 }).match).toBe(false);
  });

  // 13. branch condition with wildcard pattern
  it("branch condition with wildcard pattern", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "c1", type: "condition", conditionType: "branch", config: { patterns: ["feature/*", "main"] } },
        { id: "a1", type: "action", actionType: "block", config: {} },
      ],
    };
    const predicate = compileToPredicates(tree);
    expect(predicate({ branch: "feature/login" }).match).toBe(true);
    expect(predicate({ branch: "main" }).match).toBe(true);
    expect(predicate({ branch: "develop" }).match).toBe(false);
  });

  // 14. license condition matches
  it("license condition matches when license is in the list", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "c1", type: "condition", conditionType: "license", config: { licenses: ["MIT", "Apache-2.0"] } },
        { id: "a1", type: "action", actionType: "block", config: {} },
      ],
    };
    const predicate = compileToPredicates(tree);
    expect(predicate({ license: "MIT" }).match).toBe(true);
    expect(predicate({ license: "GPL-3.0" }).match).toBe(false);
  });

  // 15. Approval strategy: risk_threshold tree
  describe("risk_threshold approval strategy", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "OR",
      children: [
        {
          id: "g1",
          type: "group",
          operator: "AND",
          children: [
            { id: "c1", type: "condition", conditionType: "risk-score", config: { operator: "gt", value: 70 } },
            { id: "a1", type: "action", actionType: "block", config: { reason: "Risk too high" } },
          ],
        },
        {
          id: "g2",
          type: "group",
          operator: "AND",
          children: [
            { id: "c2", type: "condition", conditionType: "risk-score", config: { operator: "between", value: 30, upperBound: 70 } },
            { id: "a2", type: "action", actionType: "review", config: {} },
          ],
        },
      ],
    };

    it("riskScore=80 matches block action", () => {
      const predicate = compileToPredicates(tree);
      const result = predicate({ riskScore: 80 });
      expect(result.match).toBe(true);
      const traceIds = result.trace.map((t) => t.nodeId);
      expect(traceIds).toContain("a1");
      // g2 should be short-circuited
      const g2Trace = result.trace.find((t) => t.nodeId === "g2");
      expect(g2Trace?.shortCircuited).toBe(true);
    });

    it("riskScore=50 matches review action", () => {
      const predicate = compileToPredicates(tree);
      const result = predicate({ riskScore: 50 });
      expect(result.match).toBe(true);
      const traceIds = result.trace.map((t) => t.nodeId);
      expect(traceIds).toContain("a2");
    });

    it("riskScore=10 does not match", () => {
      const predicate = compileToPredicates(tree);
      const result = predicate({ riskScore: 10 });
      expect(result.match).toBe(false);
    });
  });

  // 16. Approval strategy: category_block tree
  it("category_block strategy blocks matching categories", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "c1", type: "condition", conditionType: "category", config: { categories: ["xss", "sqli", "rce"] } },
        { id: "c2", type: "condition", conditionType: "severity", config: { severities: ["critical", "high"] } },
        { id: "a1", type: "action", actionType: "block", config: { reason: "Dangerous finding" } },
      ],
    };
    const predicate = compileToPredicates(tree);
    expect(predicate({ category: "xss", severity: "critical" }).match).toBe(true);
    expect(predicate({ category: "xss", severity: "low" }).match).toBe(false);
    expect(predicate({ category: "info", severity: "critical" }).match).toBe(false);
  });

  // 17. ActionNode always returns match: true
  it("ActionNode always returns match true", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "a1", type: "action", actionType: "block", config: {} },
      ],
    };
    const predicate = compileToPredicates(tree);
    const result = predicate({});
    expect(result.match).toBe(true);
    expect(result.trace.find((t) => t.nodeId === "a1")?.match).toBe(true);
  });

  // 18. Unknown condition type returns match: false
  it("unknown condition type returns match false", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "c1", type: "condition", conditionType: "unknown-thing", config: {} },
        { id: "a1", type: "action", actionType: "block", config: {} },
      ],
    };
    const predicate = compileToPredicates(tree);
    const result = predicate({ severity: "critical" });
    expect(result.match).toBe(false);
    expect(result.trace.find((t) => t.nodeId === "c1")?.match).toBe(false);
  });
});
