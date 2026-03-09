import { createHmac } from "node:crypto";
import type { ComplianceAssessment, ComplianceCertificate } from "@sentinel/shared";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a ComplianceCertificate from an assessment, HMAC-sign it, and return
 * the JSON string representation.
 */
export function generateCertificate(
  assessment: ComplianceAssessment,
  secret: string,
): string {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days

  const verdictStatus = mapVerdictStatus(assessment.status);

  const categoryVerdicts: Record<string, "pass" | "warn" | "fail"> = {};
  for (const [cat, cs] of Object.entries(assessment.categories)) {
    categoryVerdicts[cat] = cs.status === "error" ? "fail" : cs.status;
  }

  const certificate: ComplianceCertificate = {
    id: `cert-${assessment.id}`,
    version: "1.0",
    subject: {
      projectId: assessment.projectId,
      repository: assessment.projectId, // repository info not on assessment
      commitHash: assessment.commitHash,
      branch: "unknown", // branch not stored on assessment
      author: "unknown",
      timestamp: assessment.timestamp,
    },
    verdict: {
      status: verdictStatus,
      riskScore: assessment.riskScore,
      categories: categoryVerdicts,
    },
    scanMetadata: {
      agents: assessment.agentResults.map((ar) => ({
        name: ar.agentName,
        version: ar.agentVersion,
        rulesetVersion: ar.rulesetVersion,
        rulesetHash: ar.rulesetHash,
        status: ar.status,
        findingCount: ar.findingCount,
        durationMs: ar.durationMs,
      })),
      environmentHash: computeEnvironmentHash(assessment),
      totalDurationMs: assessment.agentResults.reduce(
        (sum, ar) => sum + ar.durationMs,
        0,
      ),
      scanLevel: "standard",
    },
    compliance: {},
    signature: "", // placeholder, will be filled below
    issuedAt: now,
    expiresAt,
  };

  // Sign everything except the signature field itself
  certificate.signature = sign(certificate, secret);

  return JSON.stringify(certificate);
}

/**
 * Verify that a certificate JSON string has a valid HMAC signature.
 */
export function verifyCertificate(
  certificateJson: string,
  secret: string,
): boolean {
  try {
    const certificate: ComplianceCertificate = JSON.parse(certificateJson);
    const originalSignature = certificate.signature;
    certificate.signature = "";
    const expectedSignature = sign(certificate, secret);
    return originalSignature === expectedSignature;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sign(certificate: ComplianceCertificate, secret: string): string {
  // Temporarily clear signature to compute HMAC over remaining fields
  const saved = certificate.signature;
  certificate.signature = "";
  const payload = JSON.stringify(certificate);
  certificate.signature = saved;

  return createHmac("sha256", secret).update(payload).digest("hex");
}

function mapVerdictStatus(
  status: string,
): "pass" | "provisional" | "fail" {
  switch (status) {
    case "full_pass":
      return "pass";
    case "provisional_pass":
    case "partial":
      return "provisional";
    default:
      return "fail";
  }
}

function computeEnvironmentHash(assessment: ComplianceAssessment): string {
  const data = assessment.agentResults
    .map((ar) => `${ar.agentName}:${ar.agentVersion}:${ar.rulesetHash}`)
    .sort()
    .join("|");
  return createHmac("sha256", "sentinel-env")
    .update(data)
    .digest("hex")
    .slice(0, 16);
}
