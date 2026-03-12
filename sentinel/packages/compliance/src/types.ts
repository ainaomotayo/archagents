export interface MatchRule {
  agent?: string;
  category?: string;
  severity?: string[];
  negate?: boolean;
}

export interface ControlDefinition {
  code: string;
  name: string;
  weight: number;
  matchRules: MatchRule[];
  parentCode?: string;
  requirementType?: "automated" | "attestation" | "hybrid";
  attestationCadence?: number;
  regulatoryStatus?: "required" | "addressable";
  description?: string;
}

export interface FrameworkDefinition {
  slug: string;
  name: string;
  version: string;
  category: "supply-chain" | "governance" | "regulatory";
  controls: ControlDefinition[];
}

export type ComplianceVerdict =
  | "compliant"
  | "partially_compliant"
  | "needs_remediation"
  | "non_compliant";

export interface ControlScore {
  controlCode: string;
  score: number;
  passing: number;
  failing: number;
  total: number;
}

export interface AssessmentResult {
  frameworkSlug: string;
  score: number;
  verdict: ComplianceVerdict;
  controlScores: ControlScore[];
}

export interface FindingInput {
  id: string;
  agentName: string;
  severity: string;
  category: string | null;
  suppressed: boolean;
}

export const VALID_REPORT_TYPES = ["compliance_summary", "audit_evidence", "executive"] as const;
export type ReportType = (typeof VALID_REPORT_TYPES)[number];

export const EVIDENCE_EVENT_TYPES = [
  "scan_completed",
  "certificate_issued",
  "certificate_revoked",
  "policy_changed",
  "compliance_assessed",
  "report_generated",
  "finding_suppressed",
] as const;
export type EvidenceEventType = (typeof EVIDENCE_EVENT_TYPES)[number];
