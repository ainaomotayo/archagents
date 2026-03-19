/**
 * SENTINEL Dashboard — API Client
 *
 * Fetches data from the SENTINEL API when available.
 * Falls back to empty values when the API is unreachable.
 */

import type {
  AgingDataPoint,
  AIAnomalyAlert,
  AIMetricsConfig,
  AIMetricsStats,
  AIProjectComparison,
  AIProjectMetric,
  AIToolBreakdownEntry,
  AITrendResult,
  ApprovalGate,
  ApprovalStats,
  BurndownDataPoint,
  Certificate,
  ComplianceTrendPoint,
  EvidenceAttachment,
  Finding,
  FindingCountByCategory,
  FrameworkScore,
  OverviewStats,
  Project,
  RemediationItem,
  RemediationStats,
  DecisionTrace,
  IPAttributionCertificate,
  FileAttribution,
  AttributionEvidence,
  RiskTrendResult,
  Scan,
  SlaDataPoint,
  VelocityDataPoint,
} from "./types";


async function getSessionHeaders(): Promise<Record<string, string>> {
  try {
    const { getServerSession } = await import("next-auth");
    const { authOptions } = await import("./auth");
    const session = await getServerSession(authOptions);
    if (session?.user) {
      const headers: Record<string, string> = {};
      if ((session.user as any).role) headers["X-Sentinel-Role"] = (session.user as any).role;
      return headers;
    }
  } catch {
    // During build or when auth is unavailable, skip
  }
  return {};
}

async function tryApi<T>(fn: (headers: Record<string, string>) => Promise<T>, empty: T): Promise<T> {
  try {
    const headers = await getSessionHeaders();
    return await fn(headers);
  } catch {
    return empty;
  }
}

// ── Overview ──────────────────────────────────────────────────────────

export async function getOverviewStats(): Promise<OverviewStats> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const [scansData, findingsData, certsData] = await Promise.all([
      apiGet<{ scans: any[]; total: number }>("/v1/scans", { limit: "100" }, headers),
      apiGet<{ total: number }>("/v1/findings", { limit: "0" }, headers),
      apiGet<{ certificates: any[]; total: number }>("/v1/certificates", { limit: "100" }, headers),
    ]);
    const certs = certsData.certificates ?? [];
    const revoked = certs.filter((c: any) => c.revokedAt).length;
    // passRate: % of completed scans that passed (riskScore <= 20)
    const scans = scansData.scans ?? [];
    const completedScans = scans.filter((s: any) => s.status === "completed");
    const passedScans = completedScans.filter((s: any) => (s.riskScore ?? 100) <= 20);
    const passRate = completedScans.length > 0
      ? Math.round((passedScans.length / completedScans.length) * 100)
      : 0;
    return {
      totalScans: scansData.total ?? scans.length,
      activeRevocations: revoked,
      openFindings: findingsData.total ?? 0,
      passRate,
    };
  }, { totalScans: 0, activeRevocations: 0, openFindings: 0, passRate: 0 });
}

export async function getRecentScans(limit = 5): Promise<Scan[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<{ scans: any[] }>("/v1/scans", { limit: String(limit) }, headers);
    return (data.scans ?? []).map((s: any) => ({
      id: s.id,
      projectId: s.projectId,
      commit: s.commitHash ?? "",
      branch: s.branch ?? "",
      status: s.status === "completed"
        ? (s.riskScore <= 20 ? "pass" : s.riskScore <= 50 ? "provisional" : "fail")
        : s.status === "failed" ? "fail" : "running",
      riskScore: s.riskScore ?? 0,
      findingCount: s._count?.findings ?? 0,
      date: s.startedAt,
    }));
  }, []);
}

// ── Projects ──────────────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<any[]>("/v1/projects", undefined, headers);
    return data.map((p: any) => ({
      id: p.id,
      name: p.name,
      repoUrl: p.repoUrl ?? "",
      lastScanDate: p.scans?.[0]?.startedAt ?? null,
      lastScanStatus: p.scans?.[0]?.status ?? null,
      findingCount: (p.scans ?? []).reduce((sum: number, s: any) => sum + (s._count?.findings ?? 0), 0),
      scanCount: p._count?.scans ?? 0,
    }));
  }, []);
}

export async function getProjectById(id: string): Promise<Project | null> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const p = await apiGet<any>(`/v1/projects/${id}`, undefined, headers);
    return {
      id: p.id,
      name: p.name,
      repoUrl: p.repoUrl ?? "",
      lastScanDate: p.scans?.[0]?.startedAt ?? null,
      lastScanStatus: p.scans?.[0]?.status ?? null,
      findingCount: (p.scans ?? []).reduce((sum: number, s: any) => sum + (s._count?.findings ?? 0), 0),
      scanCount: p._count?.scans ?? 0,
    };
  }, null);
}

export async function getProjectScans(projectId: string): Promise<Scan[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const p = await apiGet<any>(`/v1/projects/${projectId}`, undefined, headers);
    return (p.scans ?? []).map((s: any) => ({
      id: s.id,
      projectId: s.projectId,
      commit: s.commitHash ?? "",
      branch: s.branch ?? "",
      status: s.status === "completed" ? (s.riskScore <= 20 ? "pass" : s.riskScore <= 50 ? "provisional" : "fail") : "running",
      riskScore: s.riskScore ?? 0,
      findingCount: s._count?.findings ?? 0,
      date: s.startedAt,
    }));
  }, []);
}

export async function getProjectFindingCounts(
  projectId: string,
): Promise<FindingCountByCategory[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<{ findings: any[] }>(`/v1/projects/${projectId}/findings`, { limit: "500" }, headers);
    const counts = new Map<string, number>();
    for (const f of data.findings ?? []) {
      const cat = f.category ?? f.type ?? "other";
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
  }, []);
}

// ── Findings ──────────────────────────────────────────────────────────

export async function getFindings(): Promise<Finding[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<{ findings: any[] }>("/v1/findings", { limit: "500" }, headers);
    return (data.findings ?? []).map((f: any) => ({
      id: f.id,
      projectId: f.scan?.projectId ?? f.orgId,
      scanId: f.scanId,
      title: f.title ?? f.type,
      description: f.description ?? "",
      severity: f.severity as any,
      confidence: f.confidence * 100,
      status: (f.suppressed ? "suppressed" : "open") as Finding["status"],
      category: f.category ?? f.type,
      filePath: f.file,
      lineStart: f.lineStart,
      lineEnd: f.lineEnd,
      codeSnippet: f.rawData?.codeSnippet ?? "",
      remediation: f.remediation ?? "",
      createdAt: f.createdAt,
      agentName: f.agentName ?? f.agent_name ?? "",
    }));
  }, []);
}

export async function getFindingById(id: string): Promise<Finding | null> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const f = await apiGet<any>(`/v1/findings/${id}`, undefined, headers);
    return {
      id: f.id,
      projectId: f.scan?.projectId ?? f.orgId,
      scanId: f.scanId,
      title: f.title ?? f.type,
      description: f.description ?? "",
      severity: f.severity as any,
      confidence: f.confidence * 100,
      status: (f.suppressed ? "suppressed" : "open") as Finding["status"],
      category: f.category ?? f.type,
      filePath: f.file,
      lineStart: f.lineStart,
      lineEnd: f.lineEnd,
      codeSnippet: f.rawData?.codeSnippet ?? "",
      remediation: f.remediation ?? "",
      createdAt: f.createdAt,
      agentName: f.agentName ?? f.agent_name ?? "",
    };
  }, null);
}

// ── Certificates ──────────────────────────────────────────────────────

export async function getCertificates(): Promise<Certificate[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<{ certificates: any[] }>("/v1/certificates", { limit: "100" }, headers);
    return (data.certificates ?? []).map((c: any) => ({
      id: c.id,
      projectId: c.orgId,
      scanId: c.scanId,
      commit: c.scan?.commitHash ?? "",
      branch: c.scan?.branch ?? "",
      status: c.revokedAt ? "revoked" : new Date(c.expiresAt) < new Date() ? "expired" : "active",
      riskScore: c.riskScore,
      issuedAt: c.issuedAt,
      expiresAt: c.expiresAt,
      revokedAt: c.revokedAt ?? null,
    }));
  }, []);
}

export async function getCertificateById(
  id: string,
): Promise<Certificate | null> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const c = await apiGet<any>(`/v1/certificates/${id}`, undefined, headers);
    return {
      id: c.id,
      projectId: c.orgId,
      scanId: c.scanId,
      commit: c.scan?.commitHash ?? "",
      branch: c.scan?.branch ?? "",
      status: c.revokedAt ? "revoked" : new Date(c.expiresAt) < new Date() ? "expired" : "active",
      riskScore: c.riskScore,
      issuedAt: c.issuedAt,
      expiresAt: c.expiresAt,
      revokedAt: c.revokedAt ?? null,
    } as Certificate;
  }, null);
}

export async function getProjectCertificate(
  projectId: string,
): Promise<Certificate | null> {
  const certs = await getCertificates();
  return certs.find((c) => c.projectId === projectId && c.status === "active") ?? null;
}

// ── VCS Installations ─────────────────────────────────────────────────

export interface VCSInstallation {
  id: string;
  provider: "github" | "gitlab" | "bitbucket" | "azure_devops";
  installationId: string;
  owner: string;
  active: boolean;
  webhookSecret: string;
  createdAt: string;
  azureDevOpsExt?: {
    organizationUrl: string;
    projectName: string;
  };
}

export async function getVCSInstallations(): Promise<VCSInstallation[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<{ installations: VCSInstallation[] }>("/v1/vcs-installations", undefined, headers);
    return data.installations ?? [];
  }, []);
}

export async function createVCSInstallation(data: unknown): Promise<unknown> {
  return tryApi(async (headers) => {
    const { apiPost } = await import("./api-client");
    return apiPost("/v1/vcs-installations", data, headers);
  }, null);
}

export async function updateVCSInstallation(id: string, data: unknown): Promise<unknown> {
  return tryApi(async (headers) => {
    const { apiPut } = await import("./api-client");
    return apiPut(`/v1/vcs-installations/${id}`, data, headers);
  }, null);
}

export async function deleteVCSInstallation(id: string): Promise<void> {
  return tryApi(async (headers) => {
    const { apiDelete } = await import("./api-client");
    return apiDelete(`/v1/vcs-installations/${id}`, headers);
  }, undefined);
}

// ── Webhooks ──────────────────────────────────────────────────────────

export async function getWebhooks(): Promise<unknown[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<unknown[]>("/v1/webhooks", undefined, headers);
  }, []);
}

export async function createWebhook(data: unknown): Promise<unknown> {
  return tryApi(async (headers) => {
    const { apiPost } = await import("./api-client");
    return apiPost("/v1/webhooks", data, headers);
  }, null);
}

export async function updateWebhook(id: string, data: unknown): Promise<unknown> {
  return tryApi(async (headers) => {
    const { apiPut } = await import("./api-client");
    return apiPut(`/v1/webhooks/${id}`, data, headers);
  }, null);
}

export async function deleteWebhook(id: string): Promise<void> {
  return tryApi(async (headers) => {
    const { apiDelete } = await import("./api-client");
    return apiDelete(`/v1/webhooks/${id}`, headers);
  }, undefined);
}

export async function testWebhook(id: string): Promise<unknown> {
  return tryApi(async (headers) => {
    const { apiPost } = await import("./api-client");
    return apiPost(`/v1/webhooks/${id}/test`, {}, headers);
  }, null);
}

// ── Policies ──────────────────────────────────────────────────────────

export async function getPolicies() {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<any[]>("/v1/policies", undefined, headers);
  }, []);
}

export async function getPolicyById(id: string) {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<any>(`/v1/policies/${id}`, undefined, headers);
  }, null);
}

// ── Audit Log ─────────────────────────────────────────────────────────

export async function getAuditLog(limit = 50) {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<{ events: any[] }>("/v1/audit", { limit: String(limit) }, headers);
    return data.events ?? [];
  }, []);
}

// ── Compliance ────────────────────────────────────────────────────────

export async function getComplianceScores(): Promise<FrameworkScore[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<{ frameworks: any[] }>("/v1/compliance/scores", undefined, headers);
    return (data.frameworks ?? []).map((fw: any) => ({
      frameworkSlug: fw.frameworkSlug,
      frameworkName: fw.frameworkName ?? fw.frameworkSlug,
      score: fw.score,
      verdict: fw.verdict,
      controlScores: (fw.controlScores ?? []).map((cs: any) => ({
        controlCode: cs.controlCode,
        controlName: cs.controlName ?? cs.controlCode,
        score: cs.score,
        passing: cs.passing,
        failing: cs.failing,
        total: cs.total,
      })),
    }));
  }, []);
}

export async function getComplianceTrends(
  frameworkSlug: string,
): Promise<ComplianceTrendPoint[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<{ trends: any[] }>(
      `/v1/compliance/trends/${frameworkSlug}`,
      undefined,
      headers,
    );
    return (data.trends ?? []).map((t: any) => ({
      date: t.date,
      score: t.score,
    }));
  }, []);
}

// ── Attestations ─────────────────────────────────────────────────────

import type { Attestation, AttestationOverride } from "@/components/compliance/attestation-types";

export async function getAttestations(): Promise<Attestation[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<Attestation[]>("/v1/compliance/attestations", undefined, headers);
  }, []);
}

export async function getAttestationById(id: string): Promise<Attestation | null> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<Attestation>(`/v1/compliance/attestations/${id}`, undefined, headers);
  }, null);
}

export async function getActiveAttestations(): Promise<AttestationOverride[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<AttestationOverride[]>("/v1/compliance/attestations/expiring", undefined, headers);
  }, []);
}

// ── Approvals ─────────────────────────────────────────────────────────

export async function getApprovalGates(status?: string): Promise<ApprovalGate[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const query: Record<string, string> = { limit: "50" };
    if (status && status !== "all") query.status = status;
    const data = await apiGet<{ gates: any[]; total: number }>("/v1/approvals", query, headers);
    return (data.gates ?? []).map(mapGate);
  }, []);
}

export async function getApprovalGateById(id: string): Promise<ApprovalGate | null> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<any>(`/v1/approvals/${id}`, undefined, headers);
    return mapGate(data);
  }, null);
}

export async function getApprovalStats(): Promise<ApprovalStats> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<ApprovalStats>("/v1/approvals/stats", undefined, headers);
  }, { pending: 0, escalated: 0, decidedToday: 0, avgDecisionTimeHours: 0, expiringSoon: 0 });
}

export async function reassignApprovalGate(gateId: string, assignTo: string): Promise<void> {
  return tryApi(async (headers) => {
    const { apiPost } = await import("./api-client");
    await apiPost(`/v1/approvals/${gateId}/reassign`, { assignedTo: assignTo }, headers);
  }, undefined);
}

// ── Remediation ──────────────────────────────────────────────────────

export async function getRemediations(filters?: {
  framework?: string;
  status?: string;
  itemType?: string;
}): Promise<RemediationItem[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const query: Record<string, string> = { limit: "100" };
    if (filters?.framework) query.framework = filters.framework;
    if (filters?.status) query.status = filters.status;
    if (filters?.itemType) query.itemType = filters.itemType;
    const data = await apiGet<{ items: RemediationItem[]; total: number }>(
      "/v1/compliance/remediations",
      query,
      headers,
    );
    return data.items ?? [];
  }, []);
}

export async function getRemediationStats(): Promise<RemediationStats> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<RemediationStats>("/v1/compliance/remediations/stats", undefined, headers);
  }, { open: 0, inProgress: 0, overdue: 0, completed: 0, acceptedRisk: 0, avgResolutionDays: 0, slaCompliance: 0 });
}

export async function getRemediationById(id: string): Promise<RemediationItem | null> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<RemediationItem>(`/v1/compliance/remediations/${id}`, undefined, headers);
  }, null);
}

export async function createRemediationItem(data: {
  title: string;
  description: string;
  priority?: string;
  frameworkSlug?: string;
  controlCode?: string;
  assignedTo?: string;
  dueDate?: string;
  itemType?: string;
  parentId?: string;
  findingId?: string;
}): Promise<RemediationItem> {
  const { apiPost } = await import("./api-client");
  const headers = await getSessionHeaders();
  return apiPost<RemediationItem>("/v1/compliance/remediations", data, headers);
}

export async function updateRemediation(
  id: string,
  data: {
    status?: string;
    priority?: string;
    assignedTo?: string;
    dueDate?: string;
    evidenceNotes?: string;
  },
): Promise<RemediationItem> {
  const { apiPatch } = await import("./api-client");
  const headers = await getSessionHeaders();
  return apiPatch<RemediationItem>(`/v1/compliance/remediations/${id}`, data, headers);
}

export async function linkRemediationExternal(
  id: string,
  provider: string,
  externalRef: string,
): Promise<RemediationItem> {
  const { apiPost } = await import("./api-client");
  const headers = await getSessionHeaders();
  return apiPost<RemediationItem>(`/v1/compliance/remediations/${id}/link-external`, { provider, externalRef }, headers);
}

// ── Evidence ─────────────────────────────────────────────────────────

export async function requestEvidenceUpload(
  remediationId: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
): Promise<{ uploadUrl: string; s3Key: string }> {
  const { apiPost } = await import("./api-client");
  const headers = await getSessionHeaders();
  return apiPost(`/v1/compliance/remediations/${remediationId}/evidence/presign`, { fileName, fileSize, mimeType }, headers);
}

export async function confirmEvidenceUpload(
  remediationId: string,
  s3Key: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
): Promise<any> {
  const { apiPost } = await import("./api-client");
  const headers = await getSessionHeaders();
  return apiPost(`/v1/compliance/remediations/${remediationId}/evidence/confirm`, { s3Key, fileName, fileSize, mimeType }, headers);
}

export async function listEvidence(remediationId: string): Promise<EvidenceAttachment[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<EvidenceAttachment[]>(`/v1/compliance/remediations/${remediationId}/evidence`, undefined, headers);
  }, []);
}

export async function getEvidenceDownloadUrl(
  remediationId: string,
  evidenceId: string,
): Promise<{ url: string }> {
  const { apiGet } = await import("./api-client");
  const headers = await getSessionHeaders();
  return apiGet(`/v1/compliance/remediations/${remediationId}/evidence/${evidenceId}/url`, undefined, headers);
}

export async function deleteEvidence(remediationId: string, evidenceId: string): Promise<void> {
  const { apiDelete } = await import("./api-client");
  const headers = await getSessionHeaders();
  await apiDelete(`/v1/compliance/remediations/${remediationId}/evidence/${evidenceId}`, headers);
}

// ── Charts ───────────────────────────────────────────────────────────

export async function getBurndownData(
  scope?: string,
  scopeValue?: string,
  days?: number,
): Promise<BurndownDataPoint[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const query: Record<string, string> = {};
    if (scope) query.scope = scope;
    if (scopeValue) query.scopeValue = scopeValue;
    if (days) query.days = String(days);
    return apiGet<BurndownDataPoint[]>("/v1/compliance/remediations/charts/burndown", query, headers);
  }, []);
}

export async function getVelocityData(
  scope?: string,
  scopeValue?: string,
  days?: number,
): Promise<VelocityDataPoint[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const query: Record<string, string> = {};
    if (scope) query.scope = scope;
    if (scopeValue) query.scopeValue = scopeValue;
    if (days) query.days = String(days);
    return apiGet<VelocityDataPoint[]>("/v1/compliance/remediations/charts/velocity", query, headers);
  }, []);
}

export async function getAgingData(
  scope?: string,
  scopeValue?: string,
): Promise<AgingDataPoint[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const query: Record<string, string> = {};
    if (scope) query.scope = scope;
    if (scopeValue) query.scopeValue = scopeValue;
    return apiGet<AgingDataPoint[]>("/v1/compliance/remediations/charts/aging", query, headers);
  }, []);
}

export async function getSlaData(
  scope?: string,
  scopeValue?: string,
  days?: number,
): Promise<SlaDataPoint[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const query: Record<string, string> = {};
    if (scope) query.scope = scope;
    if (scopeValue) query.scopeValue = scopeValue;
    if (days) query.days = String(days);
    return apiGet<SlaDataPoint[]>("/v1/compliance/remediations/charts/sla", query, headers);
  }, []);
}

// ── Workflow Config ──────────────────────────────────────────────────

export async function getWorkflowConfig(): Promise<{ skipStages: string[] }> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<{ skipStages: string[] }>("/v1/compliance/workflow-config", undefined, headers);
  }, { skipStages: [] });
}

export async function updateWorkflowConfig(skipStages: string[]): Promise<void> {
  const { apiPut } = await import("./api-client");
  const headers = await getSessionHeaders();
  await apiPut("/v1/compliance/workflow-config", { skipStages }, headers);
}

// ── Auto-Fix ─────────────────────────────────────────────────────────

export async function triggerAutoFix(
  remediationId: string,
): Promise<{ prUrl: string; branch: string }> {
  const { apiPost } = await import("./api-client");
  const headers = await getSessionHeaders();
  return apiPost<{ prUrl: string; branch: string }>(
    `/v1/compliance/remediations/${remediationId}/auto-fix`,
    {},
    headers,
  );
}

export async function getAutoFixStatus(
  remediationId: string,
): Promise<{ status: string; prUrl?: string }> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<{ status: string; prUrl?: string }>(
      `/v1/compliance/remediations/${remediationId}/auto-fix/status`,
      undefined,
      headers,
    );
  }, { status: "none" });
}

// ── Risk Trends ──────────────────────────────────────────

export async function getRiskTrends(days = 90): Promise<RiskTrendResult> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<RiskTrendResult>("/v1/risk-trends", { days: String(days) }, headers);
  }, { trends: {}, meta: { days, generatedAt: new Date().toISOString() } });
}

// ── Decision Trace ────────────────────────────────────────────────────
export async function getDecisionTrace(findingId: string): Promise<DecisionTrace | null> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<DecisionTrace>(`/v1/findings/${findingId}/trace`, {}, headers);
  }, null);
}

// ── IP Attribution ──────────────────────────────────────
export async function getIPAttributionCertificate(scanId: string): Promise<IPAttributionCertificate | null> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<IPAttributionCertificate>(`/v1/scans/${scanId}/ip-attribution`, {}, headers);
  }, null);
}

export async function getIPAttributions(scanId: string): Promise<FileAttribution[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<FileAttribution[]>(`/v1/scans/${scanId}/ip-attribution/files`, {}, headers);
  }, []);
}

export async function getFileEvidence(scanId: string, file: string): Promise<(FileAttribution & { evidence: AttributionEvidence[] }) | null> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<FileAttribution & { evidence: AttributionEvidence[] }>(`/v1/scans/${scanId}/ip-attribution/files/${encodeURIComponent(file)}`, {}, headers);
  }, null);
}

export async function getIPAttributionToolBreakdown(): Promise<Array<{ tool: string; files: number; loc: number }>> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<Array<{ tool: string; files: number; loc: number }>>("/v1/ip-attribution/tools", {}, headers);
  }, []);
}

// ── AI Metrics ──────────────────────────────────────────

export async function getAIMetricsStats(): Promise<AIMetricsStats> {
  return tryApi(async (headers) => {
    const res = await fetch(`${process.env.SENTINEL_API_URL}/v1/ai-metrics/stats`, {
      headers,
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`AI metrics stats: ${res.status}`);
    return res.json();
  }, {
    hasData: false,
    stats: { aiRatio: 0, aiFiles: 0, totalFiles: 0, aiLoc: 0, totalLoc: 0, aiInfluenceScore: 0, avgProbability: 0, medianProbability: 0, p95Probability: 0 },
    toolBreakdown: [],
  });
}

export async function getAIMetricsTrend(days = 30, projectId?: string): Promise<AITrendResult> {
  return tryApi(async (headers) => {
    const params = new URLSearchParams({ days: String(days) });
    if (projectId) params.set("projectId", projectId);
    const res = await fetch(`${process.env.SENTINEL_API_URL}/v1/ai-metrics/trend?${params}`, {
      headers,
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`AI metrics trend: ${res.status}`);
    return res.json();
  }, { points: [], momChange: 0, movingAvg7d: 0, movingAvg30d: 0 });
}

export async function getAIMetricsTools(projectId?: string): Promise<AIToolBreakdownEntry[]> {
  return tryApi(async (headers) => {
    const params = projectId ? `?projectId=${projectId}` : "";
    const res = await fetch(`${process.env.SENTINEL_API_URL}/v1/ai-metrics/tools${params}`, {
      headers,
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`AI metrics tools: ${res.status}`);
    return res.json();
  }, []);
}

export async function getAIMetricsProjects(limit?: number, sortBy?: string): Promise<AIProjectMetric[]> {
  return tryApi(async (headers) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (sortBy) params.set("sortBy", sortBy);
    const res = await fetch(`${process.env.SENTINEL_API_URL}/v1/ai-metrics/projects?${params}`, {
      headers,
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`AI metrics projects: ${res.status}`);
    return res.json();
  }, []);
}

export async function getAIMetricsCompare(projectIds: string[], days = 30): Promise<AIProjectComparison> {
  return tryApi(async (headers) => {
    const params = new URLSearchParams({ projectIds: projectIds.join(","), days: String(days) });
    const res = await fetch(`${process.env.SENTINEL_API_URL}/v1/ai-metrics/projects/compare?${params}`, {
      headers,
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`AI metrics compare: ${res.status}`);
    return res.json();
  }, { projectIds, days, series: {} });
}

export async function getAIMetricsAlerts(): Promise<AIAnomalyAlert[]> {
  return tryApi(async (headers) => {
    const res = await fetch(`${process.env.SENTINEL_API_URL}/v1/ai-metrics/alerts`, {
      headers,
      next: { revalidate: 30 },
    });
    if (!res.ok) throw new Error(`AI metrics alerts: ${res.status}`);
    return res.json();
  }, []);
}

export async function getAIMetricsConfig(): Promise<AIMetricsConfig> {
  return tryApi(async (headers) => {
    const res = await fetch(`${process.env.SENTINEL_API_URL}/v1/ai-metrics/config`, {
      headers,
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`AI metrics config: ${res.status}`);
    return res.json();
  }, { threshold: 0.5, strictMode: false, alertEnabled: false, alertMaxRatio: null, alertSpikeStdDev: 2.0, alertNewTool: true });
}

export async function updateAIMetricsConfig(data: Partial<AIMetricsConfig>): Promise<AIMetricsConfig> {
  const headers = await getSessionHeaders();
  const res = await fetch(`${process.env.SENTINEL_API_URL}/v1/ai-metrics/config`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`AI metrics config update: ${res.status}`);
  return res.json();
}

function mapGate(g: any): ApprovalGate {
  return {
    id: g.id,
    scanId: g.scanId,
    projectId: g.projectId,
    projectName: g.project?.name ?? g.projectName ?? "Unknown",
    status: g.status,
    gateType: g.gateType,
    triggerCriteria: g.triggerCriteria ?? {},
    priority: g.priority ?? 0,
    assignedRole: g.assignedRole ?? null,
    assignedTo: g.assignedTo ?? null,
    requestedAt: g.requestedAt,
    requestedBy: g.requestedBy ?? "system",
    expiresAt: g.expiresAt,
    escalatesAt: g.escalatesAt ?? null,
    expiryAction: g.expiryAction ?? "reject",
    decidedAt: g.decidedAt ?? null,
    scan: {
      commitHash: g.scan?.commitHash ?? "",
      branch: g.scan?.branch ?? "",
      riskScore: g.scan?.riskScore ?? 0,
      findingCount: g.scan?._count?.findings ?? g.scan?.findingCount ?? 0,
    },
    decisions: (g.decisions ?? []).map((d: any) => ({
      id: d.id,
      decidedBy: d.decidedBy,
      decision: d.decision,
      justification: d.justification,
      decidedAt: d.decidedAt,
    })),
  };
}
