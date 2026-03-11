import micromatch from "micromatch";
import type { MatchRule, FindingInput } from "../types.js";

function matchesSingleRule(rule: MatchRule, finding: FindingInput): boolean {
  if (finding.suppressed) return false;

  let matches = true;

  if (rule.agent && finding.agentName !== rule.agent) matches = false;

  if (matches && rule.category) {
    const cat = finding.category ?? "";
    if (!micromatch.isMatch(cat, rule.category)) matches = false;
  }

  if (matches && rule.severity && rule.severity.length > 0) {
    if (!rule.severity.includes(finding.severity)) matches = false;
  }

  // negate inverts the match: "passing means NO findings match this rule"
  if (rule.negate) matches = !matches;

  return matches;
}

/**
 * Match findings against a set of rules.
 * Rules are OR'd: a finding matches if it matches ANY rule.
 * Within a rule, conditions are AND'd.
 * Suppressed findings are always excluded.
 * Returns deduplicated matched findings preserving order.
 */
export function matchFindings(
  rules: MatchRule[],
  findings: FindingInput[],
): FindingInput[] {
  if (rules.length === 0) return [];

  const matched = new Set<string>();
  const result: FindingInput[] = [];

  for (const finding of findings) {
    if (matched.has(finding.id)) continue;
    for (const rule of rules) {
      if (matchesSingleRule(rule, finding)) {
        matched.add(finding.id);
        result.push(finding);
        break;
      }
    }
  }

  return result;
}
