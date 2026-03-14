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

export interface EvalResult {
  match: boolean;
  trace: TraceNode[];
}

export interface TraceNode {
  nodeId: string;
  match: boolean;
  shortCircuited?: boolean;
}

export interface PolicyInput {
  severity?: string;
  category?: string;
  riskScore?: number;
  branch?: string;
  license?: string;
  [key: string]: unknown;
}

export interface ValidationIssue {
  nodeId: string;
  level: "error" | "warning";
  message: string;
}

