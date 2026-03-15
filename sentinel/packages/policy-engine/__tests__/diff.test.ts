import { describe, it, expect } from "vitest";
import type { GroupNode } from "../src/types.js";
import { diffTrees } from "../src/diff.js";

function makeTree(overrides?: Partial<GroupNode>): GroupNode {
  return {
    id: "root",
    type: "group",
    operator: "AND",
    children: [
      {
        id: "cond-1",
        type: "condition",
        conditionType: "severity",
        config: { severities: ["critical"] },
      },
      {
        id: "action-1",
        type: "action",
        actionType: "block",
        config: { reason: "Critical finding" },
      },
    ],
    ...overrides,
  };
}

describe("diffTrees", () => {
  it("identical trees produce empty diff", () => {
    const tree = makeTree();
    const diffs = diffTrees(tree, makeTree());
    expect(diffs).toEqual([]);
  });

  it("detects added node", () => {
    const a = makeTree();
    const b = makeTree({
      children: [
        ...makeTree().children,
        {
          id: "cond-2",
          type: "condition",
          conditionType: "category",
          config: { categories: ["secret-detection"] },
        },
      ],
    });
    const diffs = diffTrees(a, b);
    expect(diffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "added", nodeId: "cond-2" }),
      ]),
    );
  });

  it("detects removed node", () => {
    const a = makeTree();
    const b = makeTree({
      children: [makeTree().children[0]], // remove action-1
    });
    const diffs = diffTrees(a, b);
    expect(diffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "removed", nodeId: "action-1" }),
      ]),
    );
  });

  it("detects modified node", () => {
    const a = makeTree();
    const b = makeTree({
      children: [
        {
          id: "cond-1",
          type: "condition",
          conditionType: "severity",
          config: { severities: ["high"] }, // changed from critical
        },
        makeTree().children[1],
      ],
    });
    const diffs = diffTrees(a, b);
    expect(diffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "modified", nodeId: "cond-1" }),
      ]),
    );
  });

  it("detects moved node", () => {
    const a: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        {
          id: "group-a",
          type: "group",
          operator: "AND",
          children: [
            {
              id: "movable",
              type: "condition",
              conditionType: "severity",
              config: { severities: ["critical"] },
            },
          ],
        },
        {
          id: "group-b",
          type: "group",
          operator: "AND",
          children: [],
        },
      ],
    };

    const b: GroupNode = {
      id: "root",
      type: "group",
      operator: "AND",
      children: [
        {
          id: "group-a",
          type: "group",
          operator: "AND",
          children: [],
        },
        {
          id: "group-b",
          type: "group",
          operator: "AND",
          children: [
            {
              id: "movable",
              type: "condition",
              conditionType: "severity",
              config: { severities: ["critical"] },
            },
          ],
        },
      ],
    };

    const diffs = diffTrees(a, b);
    expect(diffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "moved", nodeId: "movable" }),
      ]),
    );
  });

  it("detects multiple changes at once", () => {
    const a = makeTree();
    const b: GroupNode = {
      id: "root",
      type: "group",
      operator: "OR", // modified root operator
      children: [
        // cond-1 removed
        // action-1 kept
        makeTree().children[1],
        // new-cond added
        {
          id: "new-cond",
          type: "condition",
          conditionType: "branch",
          config: { patterns: ["main"] },
        },
      ],
    };

    const diffs = diffTrees(a, b);
    const types = diffs.map((d) => d.type);
    expect(types).toContain("removed"); // cond-1
    expect(types).toContain("added"); // new-cond
    expect(types).toContain("modified"); // root changed operator
    expect(diffs.length).toBeGreaterThanOrEqual(3);
  });
});
