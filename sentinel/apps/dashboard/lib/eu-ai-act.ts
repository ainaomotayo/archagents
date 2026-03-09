/**
 * SENTINEL Dashboard — EU AI Act Compliance Mapping
 *
 * Maps key EU AI Act requirements to SENTINEL capabilities and
 * assesses compliance based on scan / certificate data.
 */

import type { Certificate, Scan } from "./types";

export interface EuAiActRequirement {
  article: string;
  title: string;
  description: string;
  sentinelMapping: string;
  status: "compliant" | "partial" | "not-applicable";
}

/**
 * EU AI Act requirements relevant to high-risk AI systems,
 * mapped to SENTINEL platform capabilities.
 */
export const EU_AI_ACT_REQUIREMENTS: EuAiActRequirement[] = [
  {
    article: "Art. 9",
    title: "Risk Management System",
    description:
      "A risk management system shall be established, implemented, documented and maintained in relation to high-risk AI systems.",
    sentinelMapping:
      "SENTINEL risk scoring and continuous scanning provide an automated risk management system. Each scan generates a risk score that tracks the security posture over time.",
    status: "compliant",
  },
  {
    article: "Art. 10",
    title: "Data and Data Governance",
    description:
      "High-risk AI systems which make use of techniques involving the training of models with data shall be developed on the basis of training, validation and testing data sets.",
    sentinelMapping:
      "SENTINEL PII/secret detection identifies sensitive data exposure in AI training pipelines and application code.",
    status: "compliant",
  },
  {
    article: "Art. 11",
    title: "Technical Documentation",
    description:
      "The technical documentation shall be drawn up before a high-risk AI system is placed on the market or put into service.",
    sentinelMapping:
      "SENTINEL compliance reports and certificates serve as technical documentation artifacts. PDF reports provide audit-ready evidence.",
    status: "compliant",
  },
  {
    article: "Art. 12",
    title: "Record-Keeping",
    description:
      "High-risk AI systems shall technically allow for the automatic recording of events (logs) over the lifetime of the system.",
    sentinelMapping:
      "SENTINEL audit log tracks all scanning, certification, and policy events with timestamps and actor information.",
    status: "compliant",
  },
  {
    article: "Art. 13",
    title: "Transparency and Provision of Information",
    description:
      "High-risk AI systems shall be designed and developed in such a way to ensure that their operation is sufficiently transparent.",
    sentinelMapping:
      "SENTINEL AI-generation detection identifies AI-authored code and ensures transparency markers are present.",
    status: "compliant",
  },
  {
    article: "Art. 14",
    title: "Human Oversight",
    description:
      "High-risk AI systems shall be designed and developed so that they can be effectively overseen by natural persons.",
    sentinelMapping:
      "SENTINEL dashboard provides human oversight capabilities with finding review, policy management, and certificate approval workflows.",
    status: "compliant",
  },
  {
    article: "Art. 15",
    title: "Accuracy, Robustness and Cybersecurity",
    description:
      "High-risk AI systems shall be designed and developed in such a way that they achieve an appropriate level of accuracy, robustness and cybersecurity.",
    sentinelMapping:
      "SENTINEL security scanning, dependency analysis, and quality checks verify robustness and cybersecurity posture of AI-involved codebases.",
    status: "compliant",
  },
];

/**
 * Assess EU AI Act compliance based on actual scan and certificate data.
 *
 * Updates requirement statuses dynamically:
 * - Art. 9: requires recent scans with pass rate >= 70%
 * - Art. 11: requires at least one active certificate
 * - Art. 12: requires scan history (at least 1 scan)
 * - Art. 15: requires no scan with riskScore > 70
 */
export function assessCompliance(
  scans: Scan[],
  certificates: Certificate[],
): {
  compliant: boolean;
  requirements: EuAiActRequirement[];
  complianceScore: number;
} {
  const requirements = EU_AI_ACT_REQUIREMENTS.map((req) => ({ ...req }));

  // Art. 9 — Risk Management: need scans with acceptable pass rate
  const art9 = requirements.find((r) => r.article === "Art. 9")!;
  if (scans.length === 0) {
    art9.status = "partial";
  } else {
    const passRate =
      scans.filter((s) => s.status === "pass").length / scans.length;
    art9.status = passRate >= 0.7 ? "compliant" : "partial";
  }

  // Art. 11 — Technical Documentation: need at least one active certificate
  const art11 = requirements.find((r) => r.article === "Art. 11")!;
  const activeCerts = certificates.filter((c) => c.status === "active");
  art11.status = activeCerts.length > 0 ? "compliant" : "partial";

  // Art. 12 — Record-Keeping: need scan history
  const art12 = requirements.find((r) => r.article === "Art. 12")!;
  art12.status = scans.length > 0 ? "compliant" : "partial";

  // Art. 15 — Accuracy/Robustness: no high-risk scans
  const art15 = requirements.find((r) => r.article === "Art. 15")!;
  const highRiskScans = scans.filter((s) => s.riskScore > 70);
  if (highRiskScans.length === 0 && scans.length > 0) {
    art15.status = "compliant";
  } else if (highRiskScans.length > 0) {
    art15.status = "partial";
  } else {
    art15.status = "partial";
  }

  const applicable = requirements.filter((r) => r.status !== "not-applicable");
  const compliantCount = applicable.filter(
    (r) => r.status === "compliant",
  ).length;
  const complianceScore =
    applicable.length > 0
      ? Math.round((compliantCount / applicable.length) * 100)
      : 0;

  return {
    compliant: applicable.every((r) => r.status === "compliant"),
    requirements,
    complianceScore,
  };
}
