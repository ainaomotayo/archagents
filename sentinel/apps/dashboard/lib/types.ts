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
