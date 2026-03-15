import type { GroupNode, RuleNode } from "./types.js";

export interface TreeDiff {
  type: "added" | "removed" | "modified" | "moved";
  nodeId: string;
  path: string[];
  details?: string;
}

interface FlatEntry {
  node: RuleNode;
  path: string[];
}

function flattenTree(
  node: RuleNode,
  path: string[] = [],
): Map<string, FlatEntry> {
  const map = new Map<string, FlatEntry>();
  map.set(node.id, { node, path });

  if (node.type === "group") {
    for (const child of node.children) {
      const childMap = flattenTree(child, [...path, node.id]);
      for (const [id, entry] of childMap) {
        map.set(id, entry);
      }
    }
  }

  return map;
}

function nodeContentKey(node: RuleNode): string {
  if (node.type === "group") {
    // Exclude children for content comparison
    return JSON.stringify({ type: node.type, operator: node.operator });
  }
  if (node.type === "condition") {
    return JSON.stringify({
      type: node.type,
      conditionType: node.conditionType,
      config: node.config,
    });
  }
  // action
  return JSON.stringify({
    type: node.type,
    actionType: (node as { actionType: string }).actionType,
    config: (node as { config: Record<string, unknown> }).config,
  });
}

export function diffTrees(a: GroupNode, b: GroupNode): TreeDiff[] {
  const mapA = flattenTree(a);
  const mapB = flattenTree(b);
  const diffs: TreeDiff[] = [];

  // Nodes in B not in A -> added
  for (const [id, entry] of mapB) {
    if (!mapA.has(id)) {
      diffs.push({ type: "added", nodeId: id, path: entry.path });
    }
  }

  // Nodes in A not in B -> removed
  for (const [id, entry] of mapA) {
    if (!mapB.has(id)) {
      diffs.push({ type: "removed", nodeId: id, path: entry.path });
    }
  }

  // Nodes in both -> check modified or moved
  for (const [id, entryA] of mapA) {
    const entryB = mapB.get(id);
    if (!entryB) continue;

    const contentA = nodeContentKey(entryA.node);
    const contentB = nodeContentKey(entryB.node);

    if (contentA !== contentB) {
      diffs.push({
        type: "modified",
        nodeId: id,
        path: entryB.path,
        details: `changed from ${contentA} to ${contentB}`,
      });
    } else if (JSON.stringify(entryA.path) !== JSON.stringify(entryB.path)) {
      diffs.push({
        type: "moved",
        nodeId: id,
        path: entryB.path,
        details: `moved from [${entryA.path.join("/")}] to [${entryB.path.join("/")}]`,
      });
    }
  }

  return diffs;
}
