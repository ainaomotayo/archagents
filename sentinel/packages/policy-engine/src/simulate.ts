import type {
  GroupNode,
  RuleNode,
  ActionNode,
  PolicyInput,
  TraceNode,
} from "./types.js";
import { compileToPredicates } from "./compile-predicates.js";

export interface SimulationResult {
  match: boolean;
  trace: TraceNode[];
  matchedActions: Array<{
    nodeId: string;
    actionType: string;
    config: Record<string, unknown>;
  }>;
  evaluationTimeMs: number;
}

export function simulate(tree: GroupNode, input: PolicyInput): SimulationResult {
  const start = performance.now();

  const predicate = compileToPredicates(tree);
  const evalResult = predicate(input);

  const matchedNodeIds = new Set(
    evalResult.trace.filter((t) => t.match).map((t) => t.nodeId),
  );

  const actionNodes = collectActionNodes(tree);
  const matchedActions = actionNodes
    .filter((a) => matchedNodeIds.has(a.id))
    .map((a) => ({
      nodeId: a.id,
      actionType: a.actionType,
      config: a.config,
    }));

  return {
    match: evalResult.match,
    trace: evalResult.trace,
    matchedActions,
    evaluationTimeMs: performance.now() - start,
  };
}

function collectActionNodes(node: RuleNode): ActionNode[] {
  if (node.type === "action") {
    return [node];
  }
  if (node.type === "group") {
    return node.children.flatMap(collectActionNodes);
  }
  return [];
}
