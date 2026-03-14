import { describe, it, expect } from "vitest";
import { compileToYaml } from "../src/compile-yaml.js";
import type { GroupNode } from "../src/types.js";

describe("compileToYaml", () => {
  // 1. Simple AND group with one condition and one action
  it("renders a simple AND group with condition and action", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["critical", "high"] } },
        { id: "a1", type: "action", actionType: "block", config: {} },
      ],
    };
    const yaml = compileToYaml(tree);
    expect(yaml).toBe("AND:\n  - severity: critical, high\n  - action: block");
  });

  // 2. Nested groups produce correct indentation
  it("renders nested groups with correct indentation", () => {
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
            { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["critical"] } },
            { id: "a1", type: "action", actionType: "block", config: {} },
          ],
        },
      ],
    };
    const yaml = compileToYaml(tree);
    expect(yaml).toBe("OR:\n  AND:\n    - severity: critical\n    - action: block");
  });

  // 3. OR group renders correctly
  it("renders an OR group correctly", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "OR",
      children: [
        { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["critical"] } },
        { id: "c2", type: "condition", conditionType: "severity", config: { severities: ["high"] } },
      ],
    };
    const yaml = compileToYaml(tree);
    expect(yaml).toBe("OR:\n  - severity: critical\n  - severity: high");
  });

  // 4. NOT group renders correctly
  it("renders a NOT group correctly", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "NOT",
      children: [
        { id: "c1", type: "condition", conditionType: "branch", config: { patterns: ["main"] } },
      ],
    };
    const yaml = compileToYaml(tree);
    expect(yaml).toBe("NOT:\n  - branch: main");
  });

  // 5. severity condition renders with values
  it("renders severity condition with comma-separated values", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["critical", "high", "medium"] } },
        { id: "a1", type: "action", actionType: "block", config: {} },
      ],
    };
    const yaml = compileToYaml(tree);
    expect(yaml).toContain("- severity: critical, high, medium");
  });

  // 6. risk-score condition renders with operator
  it("renders risk-score condition with operator and value", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "c1", type: "condition", conditionType: "risk-score", config: { operator: "gt", value: 70 } },
        { id: "a1", type: "action", actionType: "block", config: {} },
      ],
    };
    const yaml = compileToYaml(tree);
    expect(yaml).toContain("- risk-score: gt 70");
  });

  // 7. branch condition renders with patterns
  it("renders branch condition with patterns", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "c1", type: "condition", conditionType: "branch", config: { patterns: ["feature/*", "main"] } },
        { id: "a1", type: "action", actionType: "block", config: {} },
      ],
    };
    const yaml = compileToYaml(tree);
    expect(yaml).toContain("- branch: feature/*, main");
  });

  // 8. Action nodes render with config
  it("renders action nodes with config key-value pairs", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        { id: "c1", type: "condition", conditionType: "severity", config: { severities: ["critical"] } },
        { id: "a1", type: "action", actionType: "block", config: { reason: "Risk too high" } },
      ],
    };
    const yaml = compileToYaml(tree);
    expect(yaml).toContain('- action: block reason="Risk too high"');
  });
});
