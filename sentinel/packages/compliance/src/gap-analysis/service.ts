import { scoreControlWithAttestation } from "../scoring/engine.js";
import type { AttestationInput } from "../scoring/engine.js";
import type { FrameworkDefinition, FindingInput, ControlDefinition } from "../types.js";

export interface GapItem {
  controlCode: string;
  controlName: string;
  parentCode?: string;
  requirementType?: string;
  regulatoryStatus?: string;
  currentScore: number;
  gapType: "automated_failure" | "missing_attestation" | "expired_attestation" | "hybrid_partial";
  severity: "critical" | "high" | "medium" | "low";
  remediation: any | null;
  suggestedActions: string[];
}

export interface GapAnalysis {
  frameworkSlug: string;
  overallScore: number;
  summary: {
    compliant: number;
    partiallyCompliant: number;
    nonCompliant: number;
    notApplicable: number;
    unattested: number;
  };
  gaps: GapItem[];
  remediationPlan: {
    totalItems: number;
    overdue: number;
    inProgress: number;
    completed: number;
  };
}

export function computeGapAnalysis(
  framework: FrameworkDefinition,
  findings: FindingInput[],
  attestations: Record<string, AttestationInput>,
  remediations: Record<string, any>,
): GapAnalysis {
  const summary = { compliant: 0, partiallyCompliant: 0, nonCompliant: 0, notApplicable: 0, unattested: 0 };
  const gaps: GapItem[] = [];
  let totalWeight = 0;
  let weightedScore = 0;

  for (const control of framework.controls) {
    const attestation = attestations[control.code] ?? null;
    const scored = scoreControlWithAttestation(control, findings, attestation);

    if (scored.attestationStatus === "not_applicable") {
      summary.notApplicable++;
      continue;
    }

    totalWeight += control.weight;
    weightedScore += scored.score * control.weight;

    if (scored.score >= 0.95) {
      summary.compliant++;
    } else if (scored.score > 0 && scored.score < 0.95) {
      summary.partiallyCompliant++;
      gaps.push(buildGapItem(control, scored, remediations[control.code] ?? null));
    } else {
      if (scored.attestationStatus === "unattested") {
        summary.unattested++;
      } else {
        summary.nonCompliant++;
      }
      gaps.push(buildGapItem(control, scored, remediations[control.code] ?? null));
    }
  }

  // Sort gaps by severity priority
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  gaps.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Remediation plan stats
  const remValues = Object.values(remediations);
  const now = new Date();
  const remediationPlan = {
    totalItems: remValues.length,
    overdue: remValues.filter((r) => r.dueDate && new Date(r.dueDate) < now && r.status !== "completed").length,
    inProgress: remValues.filter((r) => r.status === "in_progress").length,
    completed: remValues.filter((r) => r.status === "completed").length,
  };

  return {
    frameworkSlug: framework.slug,
    overallScore: totalWeight > 0 ? weightedScore / totalWeight : 0,
    summary,
    gaps,
    remediationPlan,
  };
}

function buildGapItem(control: ControlDefinition, scored: any, remediation: any): GapItem {
  const gapType = deriveGapType(control, scored);
  const severity = deriveSeverity(control, scored.score);
  return {
    controlCode: control.code,
    controlName: control.name,
    parentCode: control.parentCode,
    requirementType: control.requirementType,
    regulatoryStatus: control.regulatoryStatus,
    currentScore: scored.score,
    gapType,
    severity,
    remediation,
    suggestedActions: getSuggestedActions(gapType, control),
  };
}

function deriveGapType(control: ControlDefinition, scored: any): GapItem["gapType"] {
  if (scored.attestationStatus === "expired") return "expired_attestation";
  if (scored.attestationStatus === "unattested") return "missing_attestation";
  if (control.requirementType === "hybrid" && scored.score > 0) return "hybrid_partial";
  return "automated_failure";
}

function deriveSeverity(control: ControlDefinition, score: number): GapItem["severity"] {
  if (control.regulatoryStatus === "required" && control.weight >= 2.5 && score === 0) return "critical";
  if ((control.regulatoryStatus === "required" || control.weight >= 2.0) && score < 0.5) return "high";
  if (control.regulatoryStatus === "addressable" && control.weight >= 1.5 && score < 0.8) return "medium";
  return "low";
}

function getSuggestedActions(gapType: string, control: ControlDefinition): string[] {
  const actions: string[] = [];
  if (gapType === "missing_attestation") actions.push(`Submit attestation for ${control.code}`);
  if (gapType === "expired_attestation") actions.push(`Renew attestation for ${control.code}`);
  if (gapType === "automated_failure") actions.push(`Resolve findings matching ${control.code}`);
  if (gapType === "hybrid_partial") actions.push(`Address both automated findings and attestation for ${control.code}`);
  return actions;
}
