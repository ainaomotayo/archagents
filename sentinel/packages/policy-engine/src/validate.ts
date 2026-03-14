import type { GroupNode, RuleNode, ValidationIssue } from "./types.js";

export function validateTree(tree: GroupNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();

  // Rule 1: Root must be a GroupNode
  if (tree.type !== "group") {
    issues.push({
      nodeId: tree.id ?? "",
      level: "error",
      message: "Root node must be a group",
    });
    return issues;
  }

  walkNode(tree, issues, seenIds);

  // Rule 6: At least one ActionNode must exist somewhere in the tree
  if (!hasAction(tree)) {
    issues.push({
      nodeId: tree.id,
      level: "error",
      message: "Tree must contain at least one action node",
    });
  }

  return issues;
}

function walkNode(
  node: RuleNode,
  issues: ValidationIssue[],
  seenIds: Set<string>,
): void {
  // Rule 4: Every node must have a non-empty id
  if (!node.id || node.id.trim() === "") {
    issues.push({
      nodeId: node.id ?? "",
      level: "error",
      message: "Node must have a non-empty id",
    });
  }

  // Rule 5: No duplicate IDs
  if (node.id && node.id.trim() !== "") {
    if (seenIds.has(node.id)) {
      issues.push({
        nodeId: node.id,
        level: "error",
        message: `Duplicate id: ${node.id}`,
      });
    } else {
      seenIds.add(node.id);
    }
  }

  switch (node.type) {
    case "group": {
      const group = node;
      if (group.operator === "NOT") {
        // Rule 2: NOT groups must have exactly 1 child
        if (group.children.length !== 1) {
          issues.push({
            nodeId: group.id,
            level: "error",
            message: `NOT group must have exactly 1 child, found ${group.children.length}`,
          });
        }
      } else {
        // Rule 3: AND/OR groups must have >= 1 child
        if (group.children.length < 1) {
          issues.push({
            nodeId: group.id,
            level: "error",
            message: `${group.operator} group must have at least 1 child`,
          });
        }
      }
      for (const child of group.children) {
        walkNode(child, issues, seenIds);
      }
      break;
    }
    case "condition": {
      // Rule 7: ConditionNodes must have a non-empty conditionType
      if (!node.conditionType || node.conditionType.trim() === "") {
        issues.push({
          nodeId: node.id,
          level: "error",
          message: "Condition node must have a non-empty conditionType",
        });
      }
      break;
    }
    case "action": {
      // Rule 8: ActionNodes must have a non-empty actionType
      if (!node.actionType || node.actionType.trim() === "") {
        issues.push({
          nodeId: node.id,
          level: "error",
          message: "Action node must have a non-empty actionType",
        });
      }
      break;
    }
  }
}

function hasAction(node: RuleNode): boolean {
  if (node.type === "action") return true;
  if (node.type === "group") {
    return node.children.some((child) => hasAction(child));
  }
  return false;
}
