/**
 * SENTINEL Dashboard — Shared Types
 *
 * These types represent the domain model for the dashboard.
 * They mirror the API response shapes so the UI and data layer
 * share a single source of truth.
 */

export type ScanStatus = "pass" | "fail" | "provisional" | "running";
export type Severity = "critical" | "high" | "medium" | "low";
export type CertificateStatus = "active" | "revoked" | "expired";
export type FindingStatus = "open" | "suppressed" | "resolved";

export interface OverviewStats {
  totalScans: number;
  activeRevocations: number;
  openFindings: number;
  passRate: number; // 0–100
}

export interface Scan {
  id: string;
  projectId: string;
  commit: string;
  branch: string;
  status: ScanStatus;
  riskScore: number; // 0–100
  findingCount: number;
  date: string; // ISO 8601
}

export interface Project {
  id: string;
  name: string;
  repoUrl: string;
  lastScanDate: string | null;
  lastScanStatus: ScanStatus | null;
  findingCount: number;
  scanCount: number;
}

export interface Finding {
  id: string;
  projectId: string;
  scanId: string;
  title: string;
  description: string;
  severity: Severity;
  confidence: number; // 0–100
  status: FindingStatus;
  category: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  codeSnippet: string;
  remediation: string;
  createdAt: string;
  agentName: string;
}

export interface Certificate {
  id: string;
  projectId: string;
  scanId: string;
  commit: string;
  branch: string;
  status: CertificateStatus;
  riskScore: number;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface FindingCountByCategory {
  category: string;
  count: number;
}

// ── Compliance ────────────────────────────────────────────────────────

export type ComplianceVerdict =
  | "compliant"
  | "partially_compliant"
  | "needs_remediation"
  | "non_compliant";

export interface ControlScore {
  controlCode: string;
  controlName: string;
  score: number; // 0.0–1.0
  passing: number;
  failing: number;
  total: number;
}

export interface FrameworkScore {
  frameworkSlug: string;
  frameworkName: string;
  score: number; // 0.0–1.0
  verdict: ComplianceVerdict;
  controlScores: ControlScore[];
}

export interface ComplianceTrendPoint {
  date: string; // ISO 8601
  score: number; // 0.0–1.0
}


// ── Approvals ─────────────────────────────────────────────────────────

export type ApprovalStatus = "pending" | "escalated" | "approved" | "rejected" | "expired";
export type GateType = "risk_threshold" | "category_block" | "license_review" | "always_review";
export type ExpiryAction = "reject" | "approve";

export interface ApprovalDecision {
  id: string;
  decidedBy: string;
  decision: "approve" | "reject";
  justification: string;
  decidedAt: string;
}

export interface ApprovalGate {
  id: string;
  scanId: string;
  projectId: string;
  projectName: string;
  status: ApprovalStatus;
  gateType: GateType;
  triggerCriteria: Record<string, unknown>;
  priority: number;
  assignedRole: string | null;
  assignedTo: string | null;
  requestedAt: string;
  requestedBy: string;
  expiresAt: string;
  escalatesAt: string | null;
  expiryAction: ExpiryAction;
  decidedAt: string | null;
  scan: {
    commitHash: string;
    branch: string;
    riskScore: number;
    findingCount: number;
  };
  decisions: ApprovalDecision[];
}

export interface ApprovalStats {
  pending: number;
  escalated: number;
  decidedToday: number;
  avgDecisionTimeHours: number;
  expiringSoon: number;
}

// ── Remediation ──────────────────────────────────────────────────────

export interface RemediationItem {
  id: string;
  orgId: string;
  frameworkSlug: string | null;
  controlCode: string | null;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  dueDate: string | null;
  completedAt: string | null;
  completedBy: string | null;
  evidenceNotes: string | null;
  linkedFindingIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  parentId: string | null;
  findingId: string | null;
  itemType: string;
  priorityScore: number;
  externalRef: string | null;
  children?: RemediationItem[];
}

export interface RemediationStats {
  open: number;
  inProgress: number;
  overdue: number;
  completed: number;
  acceptedRisk: number;
  avgResolutionDays: number;
  slaCompliance: number;
}

// ── Evidence ─────────────────────────────────────────────────────────

export interface EvidenceAttachment {
  id: string;
  remediationId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  s3Key: string;
  uploadedBy: string;
  createdAt: string;
}

// ── Charts ───────────────────────────────────────────────────────────

export interface BurndownDataPoint {
  date: string;
  open: number;
  inProgress: number;
}

export interface VelocityDataPoint {
  week: string;
  completed: number;
}

export interface AgingDataPoint {
  bucket: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface SlaDataPoint {
  date: string;
  compliance: number;
}

// ── AI Metrics ──────────────────────────────────────────
export interface AIMetricsStats {
  hasData: boolean;
  stats: {
    aiRatio: number;
    aiFiles: number;
    totalFiles: number;
    aiLoc: number;
    totalLoc: number;
    aiInfluenceScore: number;
    avgProbability: number;
    medianProbability: number;
    p95Probability: number;
  };
  toolBreakdown: AIToolBreakdownEntry[];
}

export interface AIToolBreakdownEntry {
  tool: string;
  confirmedFiles: number;
  estimatedFiles: number;
  totalLoc: number;
  percentage: number;
}

export interface AITrendPoint {
  date: string;
  aiRatio: number;
  aiInfluenceScore: number;
  scanCount: number;
}

export interface AITrendResult {
  points: AITrendPoint[];
  momChange: number;
  movingAvg7d: number;
  movingAvg30d: number;
}

export interface AIProjectMetric {
  projectId: string;
  projectName: string;
  aiRatio: number;
  aiInfluenceScore: number;
  aiFiles: number;
  totalFiles: number;
}

export interface AIProjectComparison {
  projectIds: string[];
  days: number;
  series: Record<string, { date: string; aiRatio: number; aiInfluenceScore: number }[]>;
}

export interface AIAnomalyAlert {
  type: "threshold_exceeded" | "spike_detected" | "new_tool";
  projectId?: string;
  projectName?: string;
  detail: string;
  severity: "warning" | "critical";
  detectedAt: string;
}

export interface AIMetricsConfig {
  threshold: number;
  strictMode: boolean;
  alertEnabled: boolean;
  alertMaxRatio: number | null;
  alertSpikeStdDev: number;
  alertNewTool: boolean;
}

// Risk Trend
export interface RiskTrendPoint {
  date: string;
  score: number;
}

export interface ProjectRiskTrend {
  points: RiskTrendPoint[];
  direction: "up" | "down" | "flat";
  changePercent: number;
}

export interface RiskTrendResult {
  trends: Record<string, ProjectRiskTrend>;
  meta: {
    days: number;
    generatedAt: string;
  };
}

// Decision Trace
export interface DecisionTraceSignal {
  weight: number;
  rawValue: number;
  probability: number;
  contribution: number;
  detail: Record<string, unknown>;
}

export interface DecisionTrace {
  id: string;
  findingId: string;
  toolName: string | null;
  modelVersion: string | null;
  promptHash: string | null;
  promptCategory: string | null;
  overallScore: number;
  signals: Record<string, DecisionTraceSignal>;
  declaredTool: string | null;
  declaredModel: string | null;
  enrichedAt: string | null;
}

// IP Attribution
export interface IPAttributionClassificationSummary {
  files: number;
  loc: number;
  percentage: number;
}

export interface IPAttributionToolBreakdown {
  tool: string;
  model: string | null;
  files: number;
  loc: number;
  percentage: number;
  confirmedCount: number;
  estimatedCount: number;
}

export interface IPAttributionFileEntry {
  path: string;
  classification: string;
  confidence: number;
  primarySource: string;
  toolName: string | null;
  toolModel: string | null;
  loc: number;
  fusionMethod: string;
  conflicting: boolean;
  evidence: Array<{
    source: string;
    classification: string;
    confidence: number;
  }>;
}

export interface IPAttributionCertificate {
  id: string;
  version: string;
  subject: {
    scanId: string;
    projectId: string;
    repository: string;
    commitHash: string;
    branch: string;
    author: string;
    timestamp: string;
  };
  summary: {
    totalFiles: number;
    totalLoc: number;
    classifications: {
      human: IPAttributionClassificationSummary;
      aiGenerated: IPAttributionClassificationSummary;
      aiAssisted: IPAttributionClassificationSummary;
      mixed: IPAttributionClassificationSummary;
      unknown: IPAttributionClassificationSummary;
    };
    overallAiRatio: number;
    avgConfidence: number;
    conflictingFiles: number;
  };
  toolBreakdown: IPAttributionToolBreakdown[];
  files: IPAttributionFileEntry[];
  methodology: {
    algorithm: string;
    algorithmVersion: string;
    orgBaseRate: number;
    sources: string[];
    classificationThresholds: {
      aiGenerated: number;
      aiAssisted: number;
    };
  };
  provenance: {
    generatedBy: string;
    generatedAt: string;
    agentVersions: Record<string, string>;
    evidenceChainHash: string;
  };
  signature: string;
}

export interface FileAttribution {
  id: string;
  certificateId: string;
  file: string;
  classification: string;
  confidence: number;
  primarySource: string;
  toolName: string | null;
  toolModel: string | null;
  loc: number;
  fusionMethod: string;
  conflicting: boolean;
}

export interface AttributionEvidence {
  id: string;
  attributionId: string;
  source: string;
  classification: string;
  confidence: number;
  toolName: string | null;
  toolModel: string | null;
  rawEvidence: Record<string, unknown>;
}
