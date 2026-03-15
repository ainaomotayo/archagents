import { describe, it, expect } from "vitest";
import type { GroupNode } from "../src/types.js";
import { simulate } from "../src/simulate.js";

// Tree: OR( AND(risk-score>70, block), AND(risk-score between 30-70, review) )
const riskThresholdTree: GroupNode = {
  id: "root",
  type: "group",
  operator: "OR",
  children: [
    {
      id: "high-group",
      type: "group",
      operator: "AND",
      children: [
        {
          id: "risk-high",
          type: "condition",
          conditionType: "risk-score",
          config: { operator: "gt", value: 70 },
        },
        {
          id: "block-action",
          type: "action",
          actionType: "block",
          config: { reason: "High risk" },
        },
      ],
    },
    {
      id: "medium-group",
      type: "group",
      operator: "AND",
      children: [
        {
          id: "risk-medium",
          type: "condition",
          conditionType: "risk-score",
          config: { operator: "between", value: 30, upperBound: 70 },
        },
        {
          id: "review-action",
          type: "action",
          actionType: "review",
          config: { assignee: "security-team" },
        },
      ],
    },
  ],
};

// Tree: AND(category:secret-detection, severity:critical, block)
const categoryBlockTree: GroupNode = {
  id: "cat-root",
  type: "group",
  operator: "AND",
  children: [
    {
      id: "cat-cond",
      type: "condition",
      conditionType: "category",
      config: { categories: ["secret-detection"] },
    },
    {
      id: "sev-cond",
      type: "condition",
      conditionType: "severity",
      config: { severities: ["critical"] },
    },
    {
      id: "cat-block",
      type: "action",
      actionType: "block",
      config: { reason: "Secret detected" },
    },
  ],
};

// Tree: AND(license:GPL-3.0/AGPL-3.0, review)
const licenseReviewTree: GroupNode = {
  id: "lic-root",
  type: "group",
  operator: "AND",
  children: [
    {
      id: "lic-cond",
      type: "condition",
      conditionType: "license",
      config: { licenses: ["GPL-3.0", "AGPL-3.0"] },
    },
    {
      id: "lic-review",
      type: "action",
      actionType: "review",
      config: { assignee: "legal" },
    },
  ],
};

// Tree: AND(branch:main/release/*, review)
const alwaysReviewTree: GroupNode = {
  id: "branch-root",
  type: "group",
  operator: "AND",
  children: [
    {
      id: "branch-cond",
      type: "condition",
      conditionType: "branch",
      config: { patterns: ["main", "release/*"] },
    },
    {
      id: "branch-review",
      type: "action",
      actionType: "review",
      config: { assignee: "team-lead" },
    },
  ],
};

describe("simulate", () => {
  it("risk_threshold tree with riskScore=80 matches with block action", () => {
    const result = simulate(riskThresholdTree, { riskScore: 80 });
    expect(result.match).toBe(true);
    expect(result.matchedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: "block-action", actionType: "block" }),
      ]),
    );
  });

  it("risk_threshold tree with riskScore=50 matches with review action", () => {
    const result = simulate(riskThresholdTree, { riskScore: 50 });
    expect(result.match).toBe(true);
    expect(result.matchedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: "review-action", actionType: "review" }),
      ]),
    );
  });

  it("risk_threshold tree with riskScore=10 does not match", () => {
    const result = simulate(riskThresholdTree, { riskScore: 10 });
    expect(result.match).toBe(false);
    expect(result.matchedActions).toEqual([]);
  });

  it("category_block tree matching returns block action", () => {
    const result = simulate(categoryBlockTree, {
      category: "secret-detection",
      severity: "critical",
    });
    expect(result.match).toBe(true);
    expect(result.matchedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: "cat-block", actionType: "block" }),
      ]),
    );
  });

  it("license_review tree matching returns review action", () => {
    const result = simulate(licenseReviewTree, { license: "GPL-3.0" });
    expect(result.match).toBe(true);
    expect(result.matchedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: "lic-review", actionType: "review" }),
      ]),
    );
  });

  it("always_review tree matches branch main", () => {
    const result = simulate(alwaysReviewTree, { branch: "main" });
    expect(result.match).toBe(true);
    expect(result.matchedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: "branch-review", actionType: "review" }),
      ]),
    );
  });

  it("evaluationTimeMs is a positive number", () => {
    const result = simulate(riskThresholdTree, { riskScore: 80 });
    expect(result.evaluationTimeMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.evaluationTimeMs).toBe("number");
  });

  it("empty AND group matches (vacuous truth)", () => {
    const emptyTree: GroupNode = {
      id: "empty-root",
      type: "group",
      operator: "AND",
      children: [],
    };
    const result = simulate(emptyTree, {});
    expect(result.match).toBe(true);
    expect(result.matchedActions).toEqual([]);
  });
});
