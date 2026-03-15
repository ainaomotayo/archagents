import { describe, it, expect } from "vitest";
import { validateTree } from "../src/validate.js";
import type { GroupNode } from "../src/types.js";

describe("validateTree", () => {
  it("returns no issues for a valid AND group with condition and action", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        {
          id: "c1",
          type: "condition",
          conditionType: "severity",
          config: { value: "high" },
        },
        {
          id: "a1",
          type: "action",
          actionType: "block",
          config: {},
        },
      ],
    };
    expect(validateTree(tree)).toEqual([]);
  });

  it("returns no issues for a valid tree with nested groups", () => {
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
            {
              id: "c1",
              type: "condition",
              conditionType: "severity",
              config: { value: "critical" },
            },
            {
              id: "a1",
              type: "action",
              actionType: "notify",
              config: { channel: "slack" },
            },
          ],
        },
        {
          id: "c2",
          type: "condition",
          conditionType: "category",
          config: { value: "xss" },
        },
      ],
    };
    expect(validateTree(tree)).toEqual([]);
  });

  it("returns error for NOT group with 0 children", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "NOT",
      children: [],
    };
    const issues = validateTree(tree);
    expect(issues.some((i) => i.message.includes("NOT group must have exactly 1 child"))).toBe(true);
  });

  it("returns error for NOT group with 2 children", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "NOT",
      children: [
        {
          id: "c1",
          type: "condition",
          conditionType: "severity",
          config: {},
        },
        {
          id: "a1",
          type: "action",
          actionType: "block",
          config: {},
        },
      ],
    };
    const issues = validateTree(tree);
    expect(issues.some((i) => i.message.includes("NOT group must have exactly 1 child"))).toBe(true);
  });

  it("returns error for AND group with 0 children", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [],
    };
    const issues = validateTree(tree);
    expect(issues.some((i) => i.message.includes("AND group must have at least 1 child"))).toBe(true);
  });

  it("returns error for OR group with 0 children", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "OR",
      children: [],
    };
    const issues = validateTree(tree);
    expect(issues.some((i) => i.message.includes("OR group must have at least 1 child"))).toBe(true);
  });

  it("returns error for node with empty id", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        {
          id: "",
          type: "condition",
          conditionType: "severity",
          config: {},
        },
        {
          id: "a1",
          type: "action",
          actionType: "block",
          config: {},
        },
      ],
    };
    const issues = validateTree(tree);
    expect(issues.some((i) => i.message.includes("non-empty id"))).toBe(true);
  });

  it("returns error for duplicate IDs", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        {
          id: "dup",
          type: "condition",
          conditionType: "severity",
          config: {},
        },
        {
          id: "dup",
          type: "action",
          actionType: "block",
          config: {},
        },
      ],
    };
    const issues = validateTree(tree);
    expect(issues.some((i) => i.message.includes("Duplicate id"))).toBe(true);
  });

  it("returns error for tree with no ActionNode", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        {
          id: "c1",
          type: "condition",
          conditionType: "severity",
          config: {},
        },
      ],
    };
    const issues = validateTree(tree);
    expect(issues.some((i) => i.message.includes("at least one action node"))).toBe(true);
  });

  it("returns error for ConditionNode with empty conditionType", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        {
          id: "c1",
          type: "condition",
          conditionType: "",
          config: {},
        },
        {
          id: "a1",
          type: "action",
          actionType: "block",
          config: {},
        },
      ],
    };
    const issues = validateTree(tree);
    expect(issues.some((i) => i.message.includes("non-empty conditionType"))).toBe(true);
  });

  it("returns error for ActionNode with empty actionType", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        {
          id: "c1",
          type: "condition",
          conditionType: "severity",
          config: {},
        },
        {
          id: "a1",
          type: "action",
          actionType: "",
          config: {},
        },
      ],
    };
    const issues = validateTree(tree);
    expect(issues.some((i) => i.message.includes("non-empty actionType"))).toBe(true);
  });

  it("returns no issues for a complex deeply nested valid tree", () => {
    const tree: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        {
          id: "g1",
          type: "group",
          operator: "OR",
          children: [
            {
              id: "g2",
              type: "group",
              operator: "NOT",
              children: [
                {
                  id: "c1",
                  type: "condition",
                  conditionType: "branch",
                  config: { pattern: "main" },
                },
              ],
            },
            {
              id: "g3",
              type: "group",
              operator: "AND",
              children: [
                {
                  id: "c2",
                  type: "condition",
                  conditionType: "severity",
                  config: { value: "critical" },
                },
                {
                  id: "c3",
                  type: "condition",
                  conditionType: "category",
                  config: { value: "injection" },
                },
              ],
            },
          ],
        },
        {
          id: "g4",
          type: "group",
          operator: "OR",
          children: [
            {
              id: "a1",
              type: "action",
              actionType: "block",
              config: {},
            },
            {
              id: "a2",
              type: "action",
              actionType: "notify",
              config: { channel: "email" },
            },
          ],
        },
      ],
    };
    expect(validateTree(tree)).toEqual([]);
  });
});
