import { describe, it, expect } from "vitest";
import {
  treeReducer,
  buildIndex,
  findNode,
  findParent,
  cloneTree,
  type TreeState,
  type GroupNode,
  type ConditionNode,
  type ActionNode,
  type RuleNode,
} from "../contexts/tree-context";
import { validateTree } from "@sentinel/policy-engine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCondition(
  id: string,
  conditionType = "severity",
  config: Record<string, unknown> = {},
): ConditionNode {
  return { id, type: "condition", conditionType, config };
}

function makeAction(
  id: string,
  actionType = "block",
  config: Record<string, unknown> = {},
): ActionNode {
  return { id, type: "action", actionType, config };
}

function makeGroup(
  id: string,
  operator: "AND" | "OR" | "NOT" = "AND",
  children: GroupNode["children"] = [],
): GroupNode {
  return { id, type: "group", operator, children };
}

function makeState(tree: GroupNode): TreeState {
  return { tree, history: [], future: [] };
}

// ---------------------------------------------------------------------------
// Test 1: Initial state with empty tree
// ---------------------------------------------------------------------------

describe("treeReducer - initial state", () => {
  it("handles initial state with a root AND group correctly", () => {
    const root = makeGroup("root", "AND", []);
    const state = makeState(root);

    expect(state.tree.id).toBe("root");
    expect(state.tree.type).toBe("group");
    expect(state.tree.operator).toBe("AND");
    expect(state.tree.children).toHaveLength(0);
    expect(state.history).toHaveLength(0);
    expect(state.future).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 2: ADD_NODE adds block to tree
// ---------------------------------------------------------------------------

describe("treeReducer - ADD_NODE", () => {
  it("adds a severity condition to the tree", () => {
    const state = makeState(makeGroup("root", "AND", []));
    const condition = makeCondition("sev1", "severity", {
      severities: ["high", "critical"],
    });

    const next = treeReducer(state, {
      type: "ADD_NODE",
      parentId: "root",
      node: condition,
      position: 0,
    });

    expect(next.tree.children).toHaveLength(1);
    expect(next.tree.children[0].id).toBe("sev1");
    expect((next.tree.children[0] as ConditionNode).conditionType).toBe(
      "severity",
    );
  });
});

// ---------------------------------------------------------------------------
// Test 3: DELETE_NODE removes block
// ---------------------------------------------------------------------------

describe("treeReducer - DELETE_NODE", () => {
  it("removes a condition and leaves empty children", () => {
    const state = makeState(
      makeGroup("root", "AND", [makeCondition("c1", "severity")]),
    );

    const next = treeReducer(state, { type: "DELETE_NODE", nodeId: "c1" });

    expect(next.tree.children).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 4: UPDATE_NODE updates config
// ---------------------------------------------------------------------------

describe("treeReducer - UPDATE_NODE", () => {
  it("updates severities in a condition config", () => {
    const state = makeState(
      makeGroup("root", "AND", [
        makeCondition("c1", "severity", { severities: ["low"] }),
      ]),
    );

    const next = treeReducer(state, {
      type: "UPDATE_NODE",
      nodeId: "c1",
      patch: { config: { severities: ["high", "critical"] } },
    });

    const node = next.tree.children[0] as ConditionNode;
    expect(node.config).toEqual({ severities: ["high", "critical"] });
  });
});

// ---------------------------------------------------------------------------
// Test 5: UNDO restores previous state
// ---------------------------------------------------------------------------

describe("treeReducer - UNDO", () => {
  it("restores previous state after adding a node", () => {
    const state = makeState(makeGroup("root", "AND", []));

    const afterAdd = treeReducer(state, {
      type: "ADD_NODE",
      parentId: "root",
      node: makeCondition("c1"),
      position: 0,
    });
    expect(afterAdd.tree.children).toHaveLength(1);

    const afterUndo = treeReducer(afterAdd, { type: "UNDO" });
    expect(afterUndo.tree.children).toHaveLength(0);
    expect(afterUndo.future).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Test 6: REDO restores undone state
// ---------------------------------------------------------------------------

describe("treeReducer - REDO", () => {
  it("restores the undone state", () => {
    const state = makeState(makeGroup("root", "AND", []));

    const afterAdd = treeReducer(state, {
      type: "ADD_NODE",
      parentId: "root",
      node: makeCondition("c1"),
      position: 0,
    });
    const afterUndo = treeReducer(afterAdd, { type: "UNDO" });
    expect(afterUndo.tree.children).toHaveLength(0);

    const afterRedo = treeReducer(afterUndo, { type: "REDO" });
    expect(afterRedo.tree.children).toHaveLength(1);
    expect(afterRedo.tree.children[0].id).toBe("c1");
    expect(afterRedo.history).toHaveLength(1);
    expect(afterRedo.future).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 7: History capped at 50
// ---------------------------------------------------------------------------

describe("treeReducer - history cap", () => {
  it("caps history at 50 entries after 55 actions", () => {
    let state = makeState(makeGroup("root", "AND", []));

    for (let i = 0; i < 55; i++) {
      state = treeReducer(state, {
        type: "ADD_NODE",
        parentId: "root",
        node: makeCondition(`c${i}`),
        position: i,
      });
    }

    expect(state.history.length).toBeLessThanOrEqual(50);
    expect(state.history.length).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Test 8: buildIndex creates correct flat map
// ---------------------------------------------------------------------------

describe("buildIndex", () => {
  it("creates a map with 5 entries for a nested tree", () => {
    const tree = makeGroup("root", "AND", [
      makeCondition("c1", "severity"),
      makeGroup("g1", "OR", [
        makeCondition("c2", "license"),
        makeAction("a1", "block"),
      ]),
    ]);

    const index = buildIndex(tree);

    expect(index.size).toBe(5);
    expect(index.has("root")).toBe(true);
    expect(index.has("c1")).toBe(true);
    expect(index.has("g1")).toBe(true);
    expect(index.has("c2")).toBe(true);
    expect(index.has("a1")).toBe(true);

    // Verify node types are correct
    expect(index.get("root")!.type).toBe("group");
    expect(index.get("c1")!.type).toBe("condition");
    expect(index.get("a1")!.type).toBe("action");
  });
});

// ---------------------------------------------------------------------------
// Test 9: MOVE_NODE moves between groups
// ---------------------------------------------------------------------------

describe("treeReducer - MOVE_NODE", () => {
  it("moves a condition from one group to another", () => {
    const child = makeCondition("c1", "severity");
    const groupA = makeGroup("gA", "AND", [child]);
    const groupB = makeGroup("gB", "OR", []);
    const tree = makeGroup("root", "AND", [groupA, groupB]);
    const state = makeState(tree);

    const next = treeReducer(state, {
      type: "MOVE_NODE",
      nodeId: "c1",
      newParentId: "gB",
      position: 0,
    });

    const gA = next.tree.children.find((c) => c.id === "gA") as GroupNode;
    const gB = next.tree.children.find((c) => c.id === "gB") as GroupNode;
    expect(gA.children).toHaveLength(0);
    expect(gB.children).toHaveLength(1);
    expect(gB.children[0].id).toBe("c1");
  });
});

// ---------------------------------------------------------------------------
// Test 10: SET_OPERATOR changes group operator
// ---------------------------------------------------------------------------

describe("treeReducer - SET_OPERATOR", () => {
  it("changes root operator from AND to OR", () => {
    const state = makeState(makeGroup("root", "AND", []));

    const next = treeReducer(state, {
      type: "SET_OPERATOR",
      nodeId: "root",
      operator: "OR",
    });

    expect(next.tree.operator).toBe("OR");
    expect(next.history).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Test 11: REPLACE_TREE replaces entire tree
// ---------------------------------------------------------------------------

describe("treeReducer - REPLACE_TREE", () => {
  it("replaces entire tree and puts old tree in history", () => {
    const oldTree = makeGroup("root", "AND", [makeCondition("c1")]);
    const state = makeState(oldTree);

    const newTree = makeGroup("newRoot", "OR", [
      makeAction("a1", "notify"),
      makeCondition("c2", "branch"),
    ]);

    const next = treeReducer(state, { type: "REPLACE_TREE", tree: newTree });

    expect(next.tree.id).toBe("newRoot");
    expect(next.tree.operator).toBe("OR");
    expect(next.tree.children).toHaveLength(2);
    expect(next.history).toHaveLength(1);
    // The old tree should be in history
    expect(next.history[0].id).toBe("root");
    expect(next.future).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 12: Validation detects tree with no actions
// ---------------------------------------------------------------------------

describe("validateTree integration", () => {
  it("detects a tree with no actions as invalid", () => {
    const tree = makeGroup("root", "AND", [
      makeCondition("c1", "severity"),
      makeCondition("c2", "license"),
    ]);

    const issues = validateTree(tree);

    const actionError = issues.find((i) =>
      i.message.includes("at least one action"),
    );
    expect(actionError).toBeDefined();
    expect(actionError!.level).toBe("error");
  });

  it("passes validation when tree has an action", () => {
    const tree = makeGroup("root", "AND", [
      makeCondition("c1", "severity"),
      makeAction("a1", "block"),
    ]);

    const issues = validateTree(tree);

    const actionError = issues.find((i) =>
      i.message.includes("at least one action"),
    );
    expect(actionError).toBeUndefined();
  });
});
