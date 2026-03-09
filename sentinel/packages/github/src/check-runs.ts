/**
 * Build GitHub Check Run request payloads for SENTINEL scans.
 *
 * These functions produce plain objects that can be sent to the
 * GitHub Checks API (POST /repos/{owner}/{repo}/check-runs or PATCH).
 */
import type { AssessmentStatus } from "@sentinel/shared";
import type { CheckAnnotation } from "./annotations.js";

// ── Types ──

export interface CheckRunInput {
  name: string;
  head_sha: string;
  status: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral" | "action_required";
  output: {
    title: string;
    summary: string;
    annotations?: CheckAnnotation[];
  };
}

// ── Constants ──

const CHECK_NAME = "SENTINEL Compliance Scan";

// ── Builders ──

/**
 * Build a Check Run payload when a scan starts (status: in_progress).
 */
export function buildCheckRunCreate(
  scanId: string,
  commitHash: string,
): CheckRunInput {
  return {
    name: CHECK_NAME,
    head_sha: commitHash,
    status: "in_progress",
    output: {
      title: "SENTINEL scan in progress",
      summary: `Scan \`${scanId}\` is running. Evaluating security, license, quality, policy, and dependency compliance.`,
    },
  };
}

/**
 * Build a Check Run payload when a scan completes.
 *
 * Maps AssessmentStatus to GitHub conclusion:
 *   full_pass   -> success
 *   provisional_pass -> neutral
 *   fail / revoked   -> failure
 *   partial          -> action_required
 */
export function buildCheckRunComplete(
  scanId: string,
  status: AssessmentStatus,
  riskScore: number,
  annotations: CheckAnnotation[],
): CheckRunInput {
  const conclusion = mapStatusToConclusion(status);
  const findingCount = annotations.length;

  return {
    name: CHECK_NAME,
    head_sha: "", // caller must set this
    status: "completed",
    conclusion,
    output: {
      title: buildCompletionTitle(status, riskScore),
      summary: buildCompletionSummary(scanId, status, riskScore, findingCount),
      annotations: annotations.length > 0 ? annotations : undefined,
    },
  };
}

/**
 * Build a Check Run update payload when a certificate is revoked.
 *
 * Flips the conclusion to "failure" regardless of original status.
 */
export function buildRevocationUpdate(scanId: string): CheckRunInput {
  return {
    name: CHECK_NAME,
    head_sha: "", // caller must set this
    status: "completed",
    conclusion: "failure",
    output: {
      title: "SENTINEL: Certificate Revoked",
      summary: `The compliance certificate for scan \`${scanId}\` has been revoked. This commit no longer meets compliance requirements.`,
    },
  };
}

// ── Helpers ──

function mapStatusToConclusion(
  status: AssessmentStatus,
): "success" | "failure" | "neutral" | "action_required" {
  switch (status) {
    case "full_pass":
      return "success";
    case "provisional_pass":
      return "neutral";
    case "fail":
    case "revoked":
      return "failure";
    case "partial":
      return "action_required";
    default:
      return "failure";
  }
}

function buildCompletionTitle(status: AssessmentStatus, riskScore: number): string {
  const label = status.replace(/_/g, " ").toUpperCase();
  return `SENTINEL: ${label} (risk ${riskScore}/100)`;
}

function buildCompletionSummary(
  scanId: string,
  status: AssessmentStatus,
  riskScore: number,
  findingCount: number,
): string {
  const lines = [
    `**Scan:** \`${scanId}\``,
    `**Status:** ${status.replace(/_/g, " ")}`,
    `**Risk score:** ${riskScore}/100`,
    `**Findings:** ${findingCount}`,
  ];
  return lines.join("\n");
}
