import { matchFindings } from "../matchers/rule-matcher.js";
import type {
  ControlDefinition,
  FindingInput,
  ControlScore,
  ComplianceVerdict,
  AssessmentResult,
} from "../types.js";

const SEVERITY_MULTIPLIER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

function maxSeverityMultiplier(findings: FindingInput[]): number {
  if (findings.length === 0) return 1;
  let max = 0;
  for (const f of findings) {
    const mult = SEVERITY_MULTIPLIER[f.severity] ?? 1;
    if (mult > max) max = mult;
  }
  return max || 1;
}

export function scoreControl(
  control: ControlDefinition,
  allFindings: FindingInput[],
): ControlScore {
  const matched = matchFindings(control.matchRules, allFindings);
  const total = allFindings.filter((f) => !f.suppressed).length;
  const failing = matched.length;
  const score = total === 0 ? 1.0 : 1.0 - failing / total;

  return {
    controlCode: control.code,
    score: Math.round(score * 1000) / 1000,
    passing: total - failing,
    failing,
    total,
  };
}

export function resolveVerdict(score: number): ComplianceVerdict {
  if (score >= 0.95) return "compliant";
  if (score >= 0.80) return "partially_compliant";
  if (score >= 0.60) return "needs_remediation";
  return "non_compliant";
}

export function scoreFramework(
  controls: ControlDefinition[],
  findings: FindingInput[],
): Omit<AssessmentResult, "frameworkSlug"> {
  if (controls.length === 0) {
    return { score: 1.0, verdict: "compliant", controlScores: [] };
  }

  const controlScores: ControlScore[] = [];
  let weightedSum = 0;
  let weightTotal = 0;

  for (const control of controls) {
    const cs = scoreControl(control, findings);
    controlScores.push(cs);

    const matched = matchFindings(control.matchRules, findings);
    const sevMult = maxSeverityMultiplier(matched);
    const weight = control.weight * sevMult;

    weightedSum += weight * cs.score;
    weightTotal += weight;
  }

  const score = weightTotal === 0 ? 1.0 : Math.round((weightedSum / weightTotal) * 1000) / 1000;
  const verdict = resolveVerdict(score);

  return { score, verdict, controlScores };
}
