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
  DigestMetrics,
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

export { generateIPAttributionPdf } from "./reports/generator.js";

export { computeGapAnalysis, type GapAnalysis, type GapItem } from "./gap-analysis/service.js";
export { RemediationService, type CreateRemediationInput, type UpdateRemediationInput } from "./remediation/service.js";
export { computePriorityScore, type PriorityScoreInput } from "./remediation/priority-score.js";
export { BAARegistryService, type RegisterBAAInput, type UpdateBAAInput } from "./baa/service.js";
export { AttestationService, type CreateAttestationInput } from "./attestation/service.js";
export { WorkflowFSM, WORKFLOW_STAGES, TERMINAL_STAGES, SPECIAL_STAGES } from "./remediation/workflow-fsm.js";
export { EvidenceService, type S3Presigner } from "./remediation/evidence-service.js";
export { ChartsService } from "./remediation/charts-service.js";
export { AutoFixService, type GitHubPRClient } from "./remediation/auto-fix-service.js";
export { SyncHandler } from "./remediation/sync-handler.js";
export { buildDigestEmailHtml } from "./reports/digest-email.js";

// AI Metrics
export { computeAIRatio, type FileSignal, type AIRatioResult } from "./ai-metrics/compute-ai-ratio.js";
export { computeToolBreakdown, type ToolBreakdownEntry } from "./ai-metrics/compute-tool-breakdown.js";
export { computeTrends, type TrendResult, type TrendPoint, type SnapshotInput } from "./ai-metrics/compute-trends.js";
export { selectGranularity } from "./ai-metrics/compute-granularity.js";
export { detectAnomalies, type AnomalyAlert, type AnomalyConfig, type ProjectSnapshot } from "./ai-metrics/detect-anomalies.js";
export { AIMetricsService, ORG_WIDE_PROJECT_ID, type ProjectAIMetric } from "./ai-metrics/service.js";

// Risk Trend
export { fillGaps, computeDirection, computeChangePercent, type TrendPoint as RiskTrendPoint } from "./risk-trend/compute.js";
export { RiskTrendService, type ProjectTrend, type RiskTrendResult } from "./risk-trend/service.js";

// Decision Trace
export { extractTrace, dominantSignal, type TraceSignalDetail, type TraceSignals, type ExtractedTrace } from "./decision-trace/extract.js";
export { DecisionTraceService } from "./decision-trace/service.js";
export {
  parseSentinelAIConfig,
  configFromEnvVars,
  matchDeclaredTool,
  enrichTracesForScan,
  type DeclaredTool,
  type SentinelAIConfig,
} from "./decision-trace/enrichment.js";

// IP Attribution
export { reconcile } from "./ip-attribution/reconciler.js";
export {
  adaptAIDetector, adaptDeclared, adaptGit, adaptLicense,
  AI_COAUTHOR_PATTERNS, BOT_AUTHOR_PATTERNS,
} from "./ip-attribution/adapters.js";
export {
  generateIPAttributionCertificate, verifyIPAttributionCertificate,
  buildIPAttributionSummary,
} from "./ip-attribution/certificate.js";
export { generateSpdxExport } from "./ip-attribution/spdx-export.js";
export { generateCycloneDxExport } from "./ip-attribution/cyclonedx-export.js";
export { IPAttributionService } from "./ip-attribution/service.js";
export type {
  Classification, SourceEvidence, ReconciledAttribution,
  IPAttributionDocument, IPAttributionReportData,
  ToolBreakdownSummary, GitMetadata, GitFileMetadata,
} from "./ip-attribution/types.js";

// Report Registry
export { ReportRegistry, type ReportTemplate, type GatherContext } from "./reports/registry.js";
export { type BrandingContext, getDefaultBranding } from "./reports/branding.js";
export { createDefaultRegistry } from "./reports/templates/index.js";

// Report Storage
export { type ReportStorage, LocalReportStorage } from "./reports/storage.js";
export { S3ReportStorage, type S3StorageConfig } from "./reports/s3-storage.js";
