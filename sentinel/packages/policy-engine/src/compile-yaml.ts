import type { GroupNode, ConditionNode, ActionNode, RuleNode } from "./types.js";

export function compileToYaml(tree: GroupNode): string {
  return renderNode(tree, 0);
}

function renderNode(node: RuleNode, indent: number): string {
  switch (node.type) {
    case "group":
      return renderGroup(node, indent);
    case "condition":
      return renderCondition(node, indent);
    case "action":
      return renderAction(node, indent);
  }
}

function renderGroup(group: GroupNode, indent: number): string {
  const prefix = " ".repeat(indent);
  const lines: string[] = [];
  lines.push(`${prefix}${group.operator}:`);
  for (const child of group.children) {
    lines.push(renderNode(child, indent + 2));
  }
  return lines.join("\n");
}

function renderCondition(node: ConditionNode, indent: number): string {
  const prefix = " ".repeat(indent);
  const summary = summarizeConditionConfig(node);
  return `${prefix}- ${node.conditionType}: ${summary}`;
}

function renderAction(node: ActionNode, indent: number): string {
  const prefix = " ".repeat(indent);
  const summary = summarizeActionConfig(node);
  return `${prefix}- action: ${node.actionType}${summary ? " " + summary : ""}`;
}

function summarizeConditionConfig(node: ConditionNode): string {
  const c = node.config;
  switch (node.conditionType) {
    case "severity":
      return (c.severities as string[])?.join(", ") ?? "";
    case "category":
      return (c.categories as string[])?.join(", ") ?? "";
    case "risk-score": {
      const op = c.operator as string;
      const val = c.value as number;
      if (op === "between") {
        return `${op} ${val}-${c.upperBound}`;
      }
      return `${op} ${val}`;
    }
    case "branch":
      return (c.patterns as string[])?.join(", ") ?? "";
    case "license":
      return (c.licenses as string[])?.join(", ") ?? "";
    default:
      return JSON.stringify(c);
  }
}

function summarizeActionConfig(node: ActionNode): string {
  const entries = Object.entries(node.config);
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ");
}
