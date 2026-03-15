import { describe, it, expect } from "vitest";
import {
  treeReducer,
  buildIndex,
  type TreeState,
  type GroupNode,
  type ConditionNode,
  type ActionNode,
} from "../contexts/tree-context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCondition(id: string, conditionType = "severity"): ConditionNode {
  return { id, type: "condition", conditionType, config: {} };
}

function makeAction(id: string, actionType = "block"): ActionNode {
  return { id, type: "action", actionType, config: {} };
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
// Tests
// ---------------------------------------------------------------------------

describe("treeReducer", () => {
  it("ADD_NODE adds a child to the specified parent at position", () => {
    const tree = makeGroup("root", "AND", [makeCondition("c1")]);
    const state = makeState(tree);
    const node = makeCondition("c2", "license");

    const next = treeReducer(state, {
      type: "ADD_NODE",
      parentId: "root",
      node,
      position: 1,
    });

    expect(next.tree.children).toHaveLength(2);
    expect(next.tree.children[1].id).toBe("c2");
  });

  it("ADD_NODE at position 0 inserts at beginning", () => {
    const tree = makeGroup("root", "AND", [makeCondition("c1")]);
    const state = makeState(tree);
    const node = makeCondition("c0");

    const next = treeReducer(state, {
      type: "ADD_NODE",
      parentId: "root",
      node,
      position: 0,
    });

    expect(next.tree.children[0].id).toBe("c0");
    expect(next.tree.children[1].id).toBe("c1");
  });

  it("ADD_NODE clears future stack", () => {
    const tree = makeGroup("root", "AND", []);
    const state: TreeState = {
      tree,
      history: [],
      future: [makeGroup("old", "OR")],
    };

    const next = treeReducer(state, {
      type: "ADD_NODE",
      parentId: "root",
      node: makeCondition("c1"),
      position: 0,
    });

    expect(next.future).toHaveLength(0);
  });

  it("MOVE_NODE moves node between groups", () => {
    const child = makeCondition("c1");
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

    const idxA = next.tree.children.find((c) => c.id === "gA") as GroupNode;
    const idxB = next.tree.children.find((c) => c.id === "gB") as GroupNode;
    expect(idxA.children).toHaveLength(0);
    expect(idxB.children).toHaveLength(1);
    expect(idxB.children[0].id).toBe("c1");
  });

  it("DELETE_NODE removes node from parent", () => {
    const tree = makeGroup("root", "AND", [
      makeCondition("c1"),
      makeCondition("c2"),
    ]);
    const state = makeState(tree);

    const next = treeReducer(state, { type: "DELETE_NODE", nodeId: "c1" });

    expect(next.tree.children).toHaveLength(1);
    expect(next.tree.children[0].id).toBe("c2");
  });

  it("DELETE_NODE removes group and its children", () => {
    const nested = makeGroup("nested", "OR", [
      makeCondition("c1"),
      makeCondition("c2"),
    ]);
    const tree = makeGroup("root", "AND", [nested, makeCondition("c3")]);
    const state = makeState(tree);

    const next = treeReducer(state, { type: "DELETE_NODE", nodeId: "nested" });

    expect(next.tree.children).toHaveLength(1);
    expect(next.tree.children[0].id).toBe("c3");
    const index = buildIndex(next.tree);
    expect(index.has("nested")).toBe(false);
    expect(index.has("c1")).toBe(false);
    expect(index.has("c2")).toBe(false);
  });

  it("UPDATE_NODE merges patch into target node", () => {
    const tree = makeGroup("root", "AND", [makeCondition("c1", "severity")]);
    const state = makeState(tree);

    const next = treeReducer(state, {
      type: "UPDATE_NODE",
      nodeId: "c1",
      patch: { config: { minSeverity: "high" } },
    });

    const node = next.tree.children[0] as ConditionNode;
    expect(node.config).toEqual({ minSeverity: "high" });
  });

  it("SET_OPERATOR changes group operator", () => {
    const tree = makeGroup("root", "AND", []);
    const state = makeState(tree);

    const next = treeReducer(state, {
      type: "SET_OPERATOR",
      nodeId: "root",
      operator: "OR",
    });

    expect(next.tree.operator).toBe("OR");
  });

  it("UNDO restores previous state", () => {
    const tree = makeGroup("root", "AND", []);
    const state = makeState(tree);

    // Perform an action first
    const afterAdd = treeReducer(state, {
      type: "ADD_NODE",
      parentId: "root",
      node: makeCondition("c1"),
      position: 0,
    });
    expect(afterAdd.tree.children).toHaveLength(1);

    // Undo
    const afterUndo = treeReducer(afterAdd, { type: "UNDO" });
    expect(afterUndo.tree.children).toHaveLength(0);
    expect(afterUndo.future).toHaveLength(1);
  });

  it("REDO restores undone state", () => {
    const tree = makeGroup("root", "AND", []);
    const state = makeState(tree);

    const afterAdd = treeReducer(state, {
      type: "ADD_NODE",
      parentId: "root",
      node: makeCondition("c1"),
      position: 0,
    });
    const afterUndo = treeReducer(afterAdd, { type: "UNDO" });
    const afterRedo = treeReducer(afterUndo, { type: "REDO" });

    expect(afterRedo.tree.children).toHaveLength(1);
    expect(afterRedo.tree.children[0].id).toBe("c1");
    expect(afterRedo.history).toHaveLength(1);
    expect(afterRedo.future).toHaveLength(0);
  });

  it("UNDO when history empty does nothing", () => {
    const tree = makeGroup("root", "AND", []);
    const state = makeState(tree);

    const next = treeReducer(state, { type: "UNDO" });

    expect(next).toBe(state); // same reference
  });

  it("history is capped at 50 entries", () => {
    let state = makeState(makeGroup("root", "AND", []));

    // Perform 55 actions
    for (let i = 0; i < 55; i++) {
      state = treeReducer(state, {
        type: "ADD_NODE",
        parentId: "root",
        node: makeCondition(`c${i}`),
        position: i,
      });
    }

    expect(state.history.length).toBe(50);
  });

  it("REPLACE_TREE replaces the entire tree", () => {
    const tree = makeGroup("root", "AND", [makeCondition("c1")]);
    const state = makeState(tree);

    const newTree = makeGroup("newRoot", "OR", [
      makeAction("a1", "notify"),
    ]);

    const next = treeReducer(state, { type: "REPLACE_TREE", tree: newTree });

    expect(next.tree.id).toBe("newRoot");
    expect(next.tree.operator).toBe("OR");
    expect(next.tree.children).toHaveLength(1);
    expect(next.tree.children[0].id).toBe("a1");
    expect(next.history).toHaveLength(1);
    expect(next.future).toHaveLength(0);
  });
});

describe("buildIndex", () => {
  it("creates correct flat map", () => {
    const tree = makeGroup("root", "AND", [
      makeCondition("c1"),
      makeGroup("g1", "OR", [
        makeCondition("c2"),
        makeAction("a1"),
      ]),
    ]);

    const index = buildIndex(tree);

    expect(index.size).toBe(5);
    expect(index.has("root")).toBe(true);
    expect(index.has("c1")).toBe(true);
    expect(index.has("g1")).toBe(true);
    expect(index.has("c2")).toBe(true);
    expect(index.has("a1")).toBe(true);
  });
});
