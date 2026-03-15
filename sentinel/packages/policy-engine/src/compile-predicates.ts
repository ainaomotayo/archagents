import type {
  GroupNode,
  ConditionNode,
  ActionNode,
  RuleNode,
  PolicyInput,
  EvalResult,
  TraceNode,
} from "./types.js";

export type Predicate = (input: PolicyInput) => EvalResult;

export function compileToPredicates(tree: GroupNode): Predicate {
  return compileNode(tree);
}

function compileNode(node: RuleNode): Predicate {
  switch (node.type) {
    case "group":
      return compileGroup(node);
    case "condition":
      return compileCondition(node);
    case "action":
      return compileAction(node);
  }
}

function compileGroup(group: GroupNode): Predicate {
  const childPredicates = group.children.map((child) => ({
    predicate: compileNode(child),
    nodeId: child.id,
  }));

  switch (group.operator) {
    case "AND":
      return (input: PolicyInput): EvalResult => {
        const trace: TraceNode[] = [];
        for (const { predicate } of childPredicates) {
          const result = predicate(input);
          trace.push(...result.trace);
          if (!result.match) {
            // Short-circuit: remaining children not evaluated
            return { match: false, trace: [...trace, { nodeId: group.id, match: false }] };
          }
        }
        return { match: true, trace: [...trace, { nodeId: group.id, match: true }] };
      };

    case "OR":
      return (input: PolicyInput): EvalResult => {
        const trace: TraceNode[] = [];
        for (let i = 0; i < childPredicates.length; i++) {
          const { predicate } = childPredicates[i];
          const result = predicate(input);
          trace.push(...result.trace);
          if (result.match) {
            // Short-circuit: mark remaining children
            for (let j = i + 1; j < childPredicates.length; j++) {
              trace.push({ nodeId: childPredicates[j].nodeId, shortCircuited: true, match: false });
            }
            return { match: true, trace: [...trace, { nodeId: group.id, match: true }] };
          }
        }
        return { match: false, trace: [...trace, { nodeId: group.id, match: false }] };
      };

    case "NOT":
      return (input: PolicyInput): EvalResult => {
        const child = childPredicates[0];
        const result = child.predicate(input);
        const negated = !result.match;
        return {
          match: negated,
          trace: [...result.trace, { nodeId: group.id, match: negated }],
        };
      };
  }
}

function compileCondition(node: ConditionNode): Predicate {
  switch (node.conditionType) {
    case "severity":
      return (input: PolicyInput): EvalResult => {
        const severities = node.config.severities as string[];
        const match = severities.includes(input.severity ?? "");
        return { match, trace: [{ nodeId: node.id, match }] };
      };

    case "category":
      return (input: PolicyInput): EvalResult => {
        const categories = node.config.categories as string[];
        const match = categories.includes(input.category ?? "");
        return { match, trace: [{ nodeId: node.id, match }] };
      };

    case "risk-score":
      return (input: PolicyInput): EvalResult => {
        const operator = node.config.operator as "gt" | "lt" | "between";
        const value = node.config.value as number;
        const riskScore = input.riskScore ?? 0;
        let match = false;

        switch (operator) {
          case "gt":
            match = riskScore > value;
            break;
          case "lt":
            match = riskScore < value;
            break;
          case "between": {
            const upperBound = node.config.upperBound as number;
            match = riskScore >= value && riskScore <= upperBound;
            break;
          }
        }

        return { match, trace: [{ nodeId: node.id, match }] };
      };

    case "branch":
      return (input: PolicyInput): EvalResult => {
        const patterns = node.config.patterns as string[];
        const branch = input.branch ?? "";
        const match = patterns.some((pattern) => {
          const regexStr = "^" + pattern.replace(/\*/g, ".*") + "$";
          return new RegExp(regexStr).test(branch);
        });
        return { match, trace: [{ nodeId: node.id, match }] };
      };

    case "license":
      return (input: PolicyInput): EvalResult => {
        const licenses = node.config.licenses as string[];
        const match = licenses.includes(input.license ?? "");
        return { match, trace: [{ nodeId: node.id, match }] };
      };

    default:
      return (): EvalResult => {
        return { match: false, trace: [{ nodeId: node.id, match: false }] };
      };
  }
}

function compileAction(node: ActionNode): Predicate {
  return (): EvalResult => {
    return { match: true, trace: [{ nodeId: node.id, match: true }] };
  };
}

