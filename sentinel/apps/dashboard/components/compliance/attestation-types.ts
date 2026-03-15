import type { ControlScore, FrameworkScore } from "./types";

export type AttestationType = "manual" | "scan_approval";

export type AttestationStatus =
  | "draft"
  | "pending_review"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "expired"
  | "superseded";

export type ApprovalStage = "review" | "final_approval";

export type ApprovalDecision =
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested";

export type EvidenceType =
  | "url"
  | "ticket"
  | "document"
  | "scan"
  | "certificate"
  | "finding"
  | "snapshot";

export interface AttestationApproval {
  id: string;
  attestationId: string;
  stage: ApprovalStage;
  decision: ApprovalDecision;
  comment: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface AttestationEvidence {
  id: string;
  attestationId: string;
  type: EvidenceType;
  title: string;
  refId: string | null;
  url: string | null;
  source: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AttestationSnapshot {
  controlScore: number;
  frameworkScore: number;
  passing: number;
  failing: number;
  total: number;
  certificateId: string | null;
  certificateStatus: string | null;
  scanRiskScore: number | null;
  capturedAt: string;
}

export interface Attestation {
  id: string;
  orgId: string;
  type: AttestationType;
  frameworkSlug: string;
  controlCode: string;
  title: string;
  description: string;
  score: number;
  status: AttestationStatus;
  scanId: string | null;
  certificateId: string | null;
  snapshot: AttestationSnapshot;
  version: number;
  validFrom: string;
  validUntil: string | null;
  expiresAt: string;
  supersededById: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  approvals: AttestationApproval[];
  evidence: AttestationEvidence[];
}

export interface AttestationOverride {
  frameworkSlug: string;
  controlCode: string;
  score: number;
  attestationId: string;
  expiresAt: string;
}

export interface CreateAttestationInput {
  type: AttestationType;
  frameworkSlug: string;
  controlCode: string;
  title: string;
  description: string;
  score: number;
  expiresAt: string;
  scanId?: string;
  certificateId?: string;
  snapshot: AttestationSnapshot;
  evidence: Omit<AttestationEvidence, "id" | "attestationId" | "createdAt">[];
}

// ── Status display ──────────────────────────────────────────────────

const STATUS_COLORS: Record<AttestationStatus, string> = {
  draft: "bg-surface-3 text-text-tertiary border-border",
  pending_review: "bg-amber-400/15 text-amber-500 border-amber-400/30",
  pending_approval: "bg-blue-400/15 text-blue-500 border-blue-400/30",
  approved: "bg-status-pass/15 text-status-pass border-status-pass/30",
  rejected: "bg-status-fail/15 text-status-fail border-status-fail/30",
  expired: "bg-surface-3 text-text-tertiary border-border",
  superseded: "bg-surface-3 text-text-tertiary border-border",
};

const STATUS_LABELS: Record<AttestationStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  superseded: "Superseded",
};

export function statusColor(status: AttestationStatus): string {
  return STATUS_COLORS[status];
}

export function statusLabel(status: AttestationStatus): string {
  return STATUS_LABELS[status];
}

// ── Framework TTL defaults ──────────────────────────────────────────

const FRAMEWORK_TTL_DAYS: Record<string, number> = {
  soc2: 90,
  iso27001: 180,
  slsa: 90,
  gdpr: 365,
  cis: 90,
  openssf: 90,
  "eu-ai-act": 180,
};

const DEFAULT_TTL_DAYS = 90;

export function defaultTTLDays(frameworkSlug: string): number {
  return FRAMEWORK_TTL_DAYS[frameworkSlug] ?? DEFAULT_TTL_DAYS;
}

// ── State machine ───────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, AttestationStatus[]> = {
  draft: ["pending_review"],
  pending_review: ["pending_approval", "rejected"],
  pending_approval: ["approved", "pending_review", "rejected"],
  approved: ["expired", "superseded"],
  rejected: [],
  expired: [],
  superseded: [],
};

const ACTION_TO_TARGET: Record<string, AttestationStatus> = {
  submit: "pending_review",
  review_approve: "pending_approval",
  review_reject: "rejected",
  review_changes: "pending_review",
  final_approve: "approved",
  final_reject: "rejected",
  expire: "expired",
  supersede: "superseded",
};

export function canTransition(
  from: AttestationStatus,
  action: string,
): boolean {
  const target = ACTION_TO_TARGET[action];
  if (!target) return false;
  return (VALID_TRANSITIONS[from] ?? []).includes(target);
}

// ── RBAC ────────────────────────────────────────────────────────────

export function canUserAct(
  role: string,
  createdBy: string,
  reviewedBy: string | null,
  action: string,
  currentUser: string,
): boolean {
  switch (action) {
    case "create":
      return role === "admin" || role === "manager";
    case "submit":
      return (
        (role === "admin" || role === "manager") && currentUser === createdBy
      );
    case "review_approve":
    case "review_reject":
    case "review_changes":
      return (
        (role === "admin" || role === "manager") && currentUser !== createdBy
      );
    case "final_approve":
    case "final_reject":
      return (
        role === "admin" &&
        currentUser !== createdBy &&
        currentUser !== reviewedBy
      );
    default:
      return false;
  }
}

// ── Snapshot builder ────────────────────────────────────────────────

export function buildSnapshot(
  frameworks: FrameworkScore[],
  frameworkSlug: string,
  controlCode: string,
  certificate?: { id: string; status: string; riskScore: number } | null,
): AttestationSnapshot | null {
  const fw = frameworks.find((f) => f.frameworkSlug === frameworkSlug);
  if (!fw) return null;
  const ctrl = fw.controlScores.find(
    (c: ControlScore) => c.controlCode === controlCode,
  );
  if (!ctrl) return null;
  return {
    controlScore: ctrl.score,
    frameworkScore: fw.score,
    passing: ctrl.passing,
    failing: ctrl.failing,
    total: ctrl.total,
    certificateId: certificate?.id ?? null,
    certificateStatus: certificate?.status ?? null,
    scanRiskScore: certificate?.riskScore ?? null,
    capturedAt: new Date().toISOString(),
  };
}
