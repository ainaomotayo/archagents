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
