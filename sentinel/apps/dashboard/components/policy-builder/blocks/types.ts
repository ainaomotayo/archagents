import type { ZodType } from "zod";

// ---------------------------------------------------------------------------
// Rule-tree node types
// Re-exported here for block plugins. Will eventually come from
// @sentinel/policy-engine once that package is consumed by the dashboard.
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
// Block plugin interface
// ---------------------------------------------------------------------------

export interface BlockPlugin<C = unknown> {
  /** Unique identifier, e.g. "condition:severity", "action:block", "group:and" */
  type: string;
  category: "condition" | "group" | "action";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultConfig: C;
  schema: ZodType<C>;
  /** Inline summary rendered on the canvas card. */
  Renderer: React.ComponentType<{ node: RuleNode; config: C }>;
  /** Property panel shown when the block is selected. */
  PropertyEditor: React.ComponentType<{ config: C; onChange: (c: C) => void }>;
}
