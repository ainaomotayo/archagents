export type {
  MatchRule,
  ControlDefinition,
  FrameworkDefinition,
  ComplianceVerdict,
  ControlScore,
  AssessmentResult,
  FindingInput,
  ReportType,
  EvidenceEventType,
} from "./types.js";

export { VALID_REPORT_TYPES, EVIDENCE_EVENT_TYPES } from "./types.js";

export { matchFindings } from "./matchers/rule-matcher.js";

export { scoreControl, scoreFramework, resolveVerdict, scoreControlWithAttestation, type AttestationInput, type AttestationControlScore } from "./scoring/engine.js";

export { BUILT_IN_FRAMEWORKS, FRAMEWORK_MAP } from "./frameworks/index.js";
export { computeEvidenceHash, verifyEvidenceChain, type ChainRecord, type ChainVerification } from "./evidence/chain.js";

export {
  generateComplianceSummaryPdf,
  generateAuditEvidencePdf,
  generateExecutivePdf,
  generateNistProfilePdf,
  generateHipaaAssessmentPdf,
  type ComplianceSummaryData,
  type AuditEvidenceData,
  type EvidenceItem,
  type ExecutiveReportData,
  type NistProfileData,
  type HipaaAssessmentData,
} from "./reports/generator.js";

export { computeGapAnalysis, type GapAnalysis, type GapItem } from "./gap-analysis/service.js";
export { RemediationService, type CreateRemediationInput, type UpdateRemediationInput } from "./remediation/service.js";
export { BAARegistryService, type RegisterBAAInput, type UpdateBAAInput } from "./baa/service.js";
export { AttestationService, type CreateAttestationInput } from "./attestation/service.js";
