"use client";

import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  useEffect,
  type ReactNode,
  type Dispatch,
} from "react";

// ---------------------------------------------------------------------------
// Types
// TODO: import from @sentinel/policy-engine once built
// ---------------------------------------------------------------------------

export interface GroupNode {
  id: string;
  type: "group";
  operator: "AND" | "OR" | "NOT";
  children: RuleNode[];
}

export interface ConditionNode {
  id: string;
  type: "condition";
  conditionType: string;
  config: Record<string, unknown>;
}

export interface ActionNode {
  id: string;
  type: "action";
  actionType: string;
  config: Record<string, unknown>;
}

export type RuleNode = GroupNode | ConditionNode | ActionNode;

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type TreeAction =
  | { type: "ADD_NODE"; parentId: string; node: RuleNode; position: number }
  | { type: "MOVE_NODE"; nodeId: string; newParentId: string; position: number }
  | { type: "DELETE_NODE"; nodeId: string }
  | { type: "UPDATE_NODE"; nodeId: string; patch: Partial<RuleNode> }
  | { type: "SET_OPERATOR"; nodeId: string; operator: "AND" | "OR" | "NOT" }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "REPLACE_TREE"; tree: GroupNode };

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface TreeState {
  tree: GroupNode;
  history: GroupNode[]; // undo stack, max 50
  future: GroupNode[]; // redo stack
}

// ---------------------------------------------------------------------------
// Helpers (exported for testing / external use)
// ---------------------------------------------------------------------------

const MAX_HISTORY = 50;

/** Recursively build a flat id -> node index. */
export function buildIndex(tree: GroupNode): Map<string, RuleNode> {
  const map = new Map<string, RuleNode>();

  function walk(node: RuleNode) {
    map.set(node.id, node);
    if (node.type === "group") {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  walk(tree);
  return map;
}

/** Find a node by id in the tree. */
export function findNode(tree: GroupNode, id: string): RuleNode | undefined {
  if (tree.id === id) return tree;
  for (const child of tree.children) {
    if (child.id === id) return child;
    if (child.type === "group") {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** Find the parent GroupNode that directly contains nodeId. */
export function findParent(
  tree: GroupNode,
  nodeId: string,
): GroupNode | undefined {
  for (const child of tree.children) {
    if (child.id === nodeId) return tree;
    if (child.type === "group") {
      const found = findParent(child, nodeId);
      if (found) return found;
    }
  }
  return undefined;
}

/** Deep clone a tree via JSON round-trip. */
export function cloneTree(tree: GroupNode): GroupNode {
  return JSON.parse(JSON.stringify(tree));
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function pushHistory(state: TreeState, newTree: GroupNode): TreeState {
  const history = [...state.history, state.tree].slice(-MAX_HISTORY);
  return { tree: newTree, history, future: [] };
}

export function treeReducer(state: TreeState, action: TreeAction): TreeState {
  switch (action.type) {
    case "ADD_NODE": {
      const newTree = cloneTree(state.tree);
      const parent = findNode(newTree, action.parentId);
      if (!parent || parent.type !== "group") return state;
      const pos = Math.max(0, Math.min(action.position, parent.children.length));
      parent.children.splice(pos, 0, JSON.parse(JSON.stringify(action.node)));
      return pushHistory(state, newTree);
    }

    case "MOVE_NODE": {
      const newTree = cloneTree(state.tree);
      // Find and remove from current parent
      const oldParent = findParent(newTree, action.nodeId);
      if (!oldParent) return state;
      const idx = oldParent.children.findIndex((c) => c.id === action.nodeId);
      if (idx === -1) return state;
      const [node] = oldParent.children.splice(idx, 1);
      // Insert into new parent
      const newParent = findNode(newTree, action.newParentId);
      if (!newParent || newParent.type !== "group") return state;
      const pos = Math.max(
        0,
        Math.min(action.position, newParent.children.length),
      );
      newParent.children.splice(pos, 0, node);
      return pushHistory(state, newTree);
    }

    case "DELETE_NODE": {
      const newTree = cloneTree(state.tree);
      const parent = findParent(newTree, action.nodeId);
      if (!parent) return state;
      const idx = parent.children.findIndex((c) => c.id === action.nodeId);
      if (idx === -1) return state;
      parent.children.splice(idx, 1);
      return pushHistory(state, newTree);
    }

    case "UPDATE_NODE": {
      const newTree = cloneTree(state.tree);
      const node = findNode(newTree, action.nodeId);
      if (!node) return state;
      Object.assign(node, action.patch);
      return pushHistory(state, newTree);
    }

    case "SET_OPERATOR": {
      const newTree = cloneTree(state.tree);
      const node = findNode(newTree, action.nodeId);
      if (!node || node.type !== "group") return state;
      node.operator = action.operator;
      return pushHistory(state, newTree);
    }

    case "UNDO": {
      if (state.history.length === 0) return state;
      const history = [...state.history];
      const previous = history.pop()!;
      return {
        tree: previous,
        history,
        future: [...state.future, state.tree],
      };
    }

    case "REDO": {
      if (state.future.length === 0) return state;
      const future = [...state.future];
      const next = future.pop()!;
      return {
        tree: next,
        history: [...state.history, state.tree],
        future,
      };
    }

    case "REPLACE_TREE": {
      return pushHistory(state, action.tree);
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface TreeContextValue {
  tree: GroupNode;
  dispatch: Dispatch<TreeAction>;
  canUndo: boolean;
  canRedo: boolean;
  index: Map<string, RuleNode>;
}

const TreeContext = createContext<TreeContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface TreeProviderProps {
  initialTree: GroupNode;
  onChange?: (tree: GroupNode) => void;
  children: ReactNode;
}

export function TreeProvider({
  initialTree,
  onChange,
  children,
}: TreeProviderProps) {
  const [state, dispatch] = useReducer(treeReducer, {
    tree: initialTree,
    history: [],
    future: [],
  });

  const index = useMemo(() => buildIndex(state.tree), [state.tree]);

  useEffect(() => {
    onChange?.(state.tree);
  }, [state.tree, onChange]);

  const value = useMemo<TreeContextValue>(
    () => ({
      tree: state.tree,
      dispatch,
      canUndo: state.history.length > 0,
      canRedo: state.future.length > 0,
      index,
    }),
    [state.tree, state.history.length, state.future.length, dispatch, index],
  );

  return <TreeContext value={value}>{children}</TreeContext>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTree(): TreeContextValue {
  const ctx = useContext(TreeContext);
  if (!ctx) {
    throw new Error("useTree must be used within a <TreeProvider>");
  }
  return ctx;
}
