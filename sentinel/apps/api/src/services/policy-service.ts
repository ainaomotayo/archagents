import { validateTree, compileToYaml, simulate } from "@sentinel/policy-engine";
import type { GroupNode, PolicyInput, ValidationIssue, SimulationResult } from "@sentinel/policy-engine";

export function validateAndCompileTree(tree: GroupNode): { valid: boolean; issues: ValidationIssue[]; yaml?: string } {
  const issues = validateTree(tree);
  const hasErrors = issues.some(i => i.level === "error");
  if (hasErrors) {
    return { valid: false, issues };
  }
  const yaml = compileToYaml(tree);
  return { valid: true, issues, yaml };
}

export function simulatePolicy(tree: GroupNode, input: PolicyInput): SimulationResult {
  return simulate(tree, input);
}
