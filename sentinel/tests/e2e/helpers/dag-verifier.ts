// tests/e2e/helpers/dag-verifier.ts
export interface DagDefinition {
  nodes: string[];
  edges: [string, string][]; // [from, to]
}

export interface DagResult {
  valid: boolean;
  matched: string[];
  missing: string[];
  orderViolations: string[];
}

export const HAPPY_PATH_DAG: DagDefinition = {
  nodes: [
    "scan.created",
    "agent.security.completed",
    "agent.dependency.completed",
    "assessment.completed",
    "certificate.issued",
  ],
  edges: [
    ["scan.created", "agent.security.completed"],
    ["scan.created", "agent.dependency.completed"],
    ["agent.security.completed", "assessment.completed"],
    ["agent.dependency.completed", "assessment.completed"],
    ["assessment.completed", "certificate.issued"],
  ],
};

export const TIMEOUT_DAG: DagDefinition = {
  nodes: [
    "scan.created",
    "assessment.completed",
    "certificate.issued",
  ],
  edges: [
    ["scan.created", "assessment.completed"],
    ["assessment.completed", "certificate.issued"],
  ],
};

export function verifyDag(dag: DagDefinition, events: string[]): DagResult {
  const seen = new Set<string>();
  const matched: string[] = [];
  const orderViolations: string[] = [];

  // Build dependency map: node -> set of prerequisites
  const prereqs = new Map<string, Set<string>>();
  for (const node of dag.nodes) prereqs.set(node, new Set());
  for (const [from, to] of dag.edges) {
    prereqs.get(to)?.add(from);
  }

  for (const event of events) {
    if (!dag.nodes.includes(event)) continue; // skip unrelated events
    // Check all prerequisites are met
    const required = prereqs.get(event);
    if (required) {
      for (const req of required) {
        if (!seen.has(req)) {
          orderViolations.push(`${event} arrived before prerequisite ${req}`);
        }
      }
    }
    seen.add(event);
    matched.push(event);
  }

  const missing = dag.nodes.filter((n) => !seen.has(n));
  return {
    valid: missing.length === 0 && orderViolations.length === 0,
    matched,
    missing,
    orderViolations,
  };
}
