import type { ControlScore, FrameworkScore, ComplianceVerdict } from "@/lib/types";

export type { ControlScore, FrameworkScore, ComplianceVerdict };

/** Color scale for heatmap cells */
export type HeatmapColor = "green" | "amber" | "orange" | "red" | "gray";

export interface SelectedCell {
  frameworkSlug: string;
  frameworkName: string;
  controlCode: string;
  controlName: string;
  score: number;
  passing: number;
  failing: number;
  total: number;
}

export function scoreToColor(score: number): HeatmapColor {
  if (score >= 0.95) return "green";
  if (score >= 0.80) return "amber";
  if (score >= 0.60) return "orange";
  return "red";
}

export function scoreToVerdict(score: number): string {
  if (score >= 0.95) return "Compliant";
  if (score >= 0.80) return "Partially compliant";
  if (score >= 0.60) return "Needs remediation";
  return "Non-compliant";
}

export function scoreToVerdictEnum(score: number): ComplianceVerdict {
  if (score >= 0.95) return "compliant";
  if (score >= 0.80) return "partially_compliant";
  if (score >= 0.60) return "needs_remediation";
  return "non_compliant";
}

export function confidenceIndicator(total: number): number {
  return 1 - 1 / Math.sqrt(total + 1);
}
