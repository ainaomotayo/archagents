/**
 * Convert SENTINEL findings into GitHub Check Run annotation objects.
 */
import type { Finding, Severity } from "@sentinel/shared";

// ── GitHub annotation types ──

export interface CheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: "notice" | "warning" | "failure";
  title: string;
  message: string;
}

// ── GitHub imposes a limit of 50 annotations per Check Run update ──

const MAX_ANNOTATIONS = 50;

// ── Severity → annotation level mapping ──

const SEVERITY_TO_LEVEL: Record<Severity, CheckAnnotation["annotation_level"]> = {
  critical: "failure",
  high: "failure",
  medium: "warning",
  low: "notice",
  info: "notice",
};

// ── Public API ──

/**
 * Convert an array of SENTINEL findings to GitHub Check Run annotations.
 *
 * - Maps severity to annotation_level (critical/high -> failure, medium -> warning, low/info -> notice).
 * - Truncates to 50 annotations (GitHub API limit).
 * - Returns an empty array when given no findings.
 */
export function findingsToAnnotations(findings: Finding[]): CheckAnnotation[] {
  if (findings.length === 0) {
    return [];
  }

  const annotations: CheckAnnotation[] = findings.map((f) => ({
    path: f.file,
    start_line: f.lineStart,
    end_line: f.lineEnd,
    annotation_level: SEVERITY_TO_LEVEL[f.severity],
    title: buildTitle(f),
    message: buildMessage(f),
  }));

  // Respect GitHub's 50-annotation limit
  return annotations.slice(0, MAX_ANNOTATIONS);
}

// ── Helpers ──

function buildTitle(finding: Finding): string {
  const prefix = `[${finding.severity.toUpperCase()}]`;

  switch (finding.type) {
    case "security":
      return `${prefix} ${finding.title}`;
    case "license":
      return `${prefix} License: ${finding.findingType}`;
    case "quality":
      return `${prefix} Quality: ${finding.metric}`;
    case "policy":
      return `${prefix} Policy: ${finding.policyName}`;
    case "dependency":
      return `${prefix} Dependency: ${finding.package}`;
    case "ai-detection":
      return `${prefix} AI-generated code detected`;
    default:
      return `${prefix} Finding`;
  }
}

function buildMessage(finding: Finding): string {
  switch (finding.type) {
    case "security":
      return `${finding.description}\n\nRemediation: ${finding.remediation}`;
    case "license":
      return `License detected: ${finding.licenseDetected ?? "unknown"}. Action: ${finding.policyAction}`;
    case "quality":
      return `${finding.detail}${finding.suggestion ? `\n\nSuggestion: ${finding.suggestion}` : ""}`;
    case "policy":
      return `Violation: ${finding.violation}${finding.requiredAlternative ? `\nRequired: ${finding.requiredAlternative}` : ""}`;
    case "dependency":
      return `Package: ${finding.package}\n${finding.detail}`;
    case "ai-detection":
      return `AI probability: ${(finding.aiProbability * 100).toFixed(1)}% (${finding.detectionMethod})`;
    default:
      return "Finding detected by SENTINEL.";
  }
}
