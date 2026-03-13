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

/* ---------- Attestation-gated scoring ---------- */

const ATTESTATION_TYPE_SCORES: Record<string, number> = {
  compliant: 1.0,
  compensating_control: 0.8,
  planned_remediation: 0.3,
};

export interface AttestationInput {
  attestationType: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface AttestationControlScore extends ControlScore {
  attestationStatus: "not_required" | "valid" | "expired" | "revoked" | "unattested" | "not_applicable";
}

function resolveAttestationStatus(
  attestation: AttestationInput | null,
): "valid" | "expired" | "revoked" | "unattested" | "not_applicable" {
  if (!attestation) return "unattested";
  if (attestation.revokedAt) return "revoked";
  if (attestation.expiresAt < new Date()) return "expired";
  if (attestation.attestationType === "not_applicable") return "not_applicable";
  return "valid";
}

export function scoreControlWithAttestation(
  control: ControlDefinition,
  allFindings: FindingInput[],
  attestation: AttestationInput | null,
): AttestationControlScore {
  const requirementType = control.requirementType ?? "automated";

  // Pure automated — existing behavior
  if (requirementType === "automated") {
    const cs = scoreControl(control, allFindings);
    return { ...cs, attestationStatus: "not_required" };
  }

  // Resolve attestation state
  const attestStatus = resolveAttestationStatus(attestation);

  // Pure attestation — score from attestation only
  if (requirementType === "attestation") {
    if (attestStatus === "not_applicable") {
      return { controlCode: control.code, score: 1.0, passing: 0, failing: 0, total: 0, attestationStatus: "not_applicable" };
    }
    if (attestStatus !== "valid") {
      return { controlCode: control.code, score: 0, passing: 0, failing: 0, total: 0, attestationStatus: attestStatus };
    }
    const typeScore = ATTESTATION_TYPE_SCORES[attestation!.attestationType] ?? 0;
    return { controlCode: control.code, score: typeScore, passing: 0, failing: 0, total: 0, attestationStatus: "valid" };
  }

  // Hybrid — min(automated, attestation)
  const cs = scoreControl(control, allFindings);
  if (attestStatus !== "valid") {
    return { ...cs, score: 0, attestationStatus: attestStatus };
  }
  const typeScore = ATTESTATION_TYPE_SCORES[attestation!.attestationType] ?? 0;
  return { ...cs, score: Math.min(cs.score, typeScore), attestationStatus: "valid" };
}

export function scoreFramework(
  controls: ControlDefinition[],
  findings: FindingInput[],
  attestations?: Record<string, AttestationInput>,
): Omit<AssessmentResult, "frameworkSlug"> {
  if (controls.length === 0) {
    return { score: 1.0, verdict: "compliant", controlScores: [] };
  }

  const controlScores: ControlScore[] = [];
  let weightedSum = 0;
  let weightTotal = 0;

  for (const control of controls) {
    const attestation = attestations?.[control.code] ?? null;
    const cs = attestations !== undefined
      ? scoreControlWithAttestation(control, findings, attestation)
      : scoreControl(control, findings);

    // Skip not_applicable controls from weighted average
    if ("attestationStatus" in cs && (cs as AttestationControlScore).attestationStatus === "not_applicable") {
      controlScores.push(cs);
      continue;
    }

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
