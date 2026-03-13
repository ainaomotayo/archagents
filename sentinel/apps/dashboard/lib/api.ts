/**
 * SENTINEL Dashboard — API Client
 *
 * Fetches data from the SENTINEL API when available.
 * Falls back to mock data when API is unreachable (dev/demo mode).
 */

import type {
  AgingDataPoint,
  ApprovalGate,
  ApprovalStats,
  BurndownDataPoint,
  Certificate,
  EvidenceAttachment,
  Finding,
  FindingCountByCategory,
  OverviewStats,
  Project,
  RemediationItem,
  RemediationStats,
  Scan,
  SlaDataPoint,
  VelocityDataPoint,
} from "./types";

import {
  MOCK_APPROVAL_GATES,
  MOCK_APPROVAL_STATS,
  MOCK_AUDIT_LOG,
  MOCK_CERTIFICATES,
  MOCK_FINDING_COUNTS_BY_CATEGORY,
  MOCK_FINDINGS,
  MOCK_OVERVIEW_STATS,
  MOCK_POLICIES,
  MOCK_PROJECTS,
  MOCK_SCANS,
} from "./mock-data";
import {
  MOCK_ITEMS as MOCK_REMEDIATION_ITEMS,
  MOCK_STATS as MOCK_REMEDIATION_STATS,
} from "./remediation-mock-data";

const USE_MOCK = !process.env.SENTINEL_API_URL;

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

async function tryApi<T>(fn: (headers: Record<string, string>) => Promise<T>, fallback: T): Promise<T> {
  if (USE_MOCK) return fallback;
  try {
    const headers = await getSessionHeaders();
    return await fn(headers);
  } catch {
    return fallback;
  }
}

// ── Overview ──────────────────────────────────────────────────────────

export async function getOverviewStats(): Promise<OverviewStats> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const [scansData, findingsData, certsData] = await Promise.all([
      apiGet<{ total: number }>("/v1/scans", { limit: "0" }, headers),
      apiGet<{ total: number }>("/v1/findings", { limit: "0" }, headers),
      apiGet<{ certificates: any[]; total: number }>("/v1/certificates", { limit: "100" }, headers),
    ]);
    const certs = certsData.certificates ?? [];
    const revoked = certs.filter((c: any) => c.status === "revoked").length;
    const passed = certs.filter((c: any) => c.riskScore <= 20).length;
    return {
      totalScans: scansData.total ?? 0,
      activeRevocations: revoked,
      openFindings: findingsData.total ?? 0,
      passRate: certs.length > 0 ? Math.round((passed / certs.length) * 100) : 0,
    };
  }, MOCK_OVERVIEW_STATS);
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
  }, MOCK_SCANS.slice(0, limit));
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
  }, MOCK_PROJECTS);
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
  }, MOCK_PROJECTS.find((p) => p.id === id) ?? null);
}

export async function getProjectScans(projectId: string): Promise<Scan[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const p = await apiGet<any>(`/v1/projects/${projectId}`, undefined, headers);
    return (p.scans ?? []).map((s: any) => ({
      id: s.id,
      projectId: s.projectId,
      commit: s.commitHash,
      branch: s.branch,
      status: s.status === "completed" ? (s.riskScore <= 20 ? "pass" : s.riskScore <= 50 ? "provisional" : "fail") : "running",
      riskScore: s.riskScore ?? 0,
      findingCount: s._count?.findings ?? 0,
      date: s.startedAt,
    }));
  }, MOCK_SCANS.filter((s) => s.projectId === projectId));
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
  }, MOCK_FINDING_COUNTS_BY_CATEGORY);
}

// ── Findings ──────────────────────────────────────────────────────────

export async function getFindings(): Promise<Finding[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<{ findings: any[] }>("/v1/findings", { limit: "100" }, headers);
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
    }));
  }, MOCK_FINDINGS);
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
    };
  }, MOCK_FINDINGS.find((f) => f.id === id) ?? null);
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
  }, MOCK_CERTIFICATES);
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
  }, MOCK_CERTIFICATES.find((c) => c.id === id) ?? null);
}

export async function getProjectCertificate(
  projectId: string,
): Promise<Certificate | null> {
  const certs = await getCertificates();
  return certs.find((c) => c.projectId === projectId && c.status === "active") ?? null;
}

// ── Policies ──────────────────────────────────────────────────────────

export async function getPolicies() {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<any[]>("/v1/policies", undefined, headers);
  }, MOCK_POLICIES);
}

export async function getPolicyById(id: string) {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<any>(`/v1/policies/${id}`, undefined, headers);
  }, MOCK_POLICIES.find((p) => p.id === id) ?? null);
}

// ── Audit Log ─────────────────────────────────────────────────────────

export async function getAuditLog(limit = 50) {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<{ events: any[] }>("/v1/audit", { limit: String(limit) }, headers);
    return data.events ?? [];
  }, MOCK_AUDIT_LOG);
}

// ── Approvals ─────────────────────────────────────────────────────────

export async function getApprovalGates(status?: string): Promise<ApprovalGate[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const query: Record<string, string> = { limit: "50" };
    if (status && status !== "all") query.status = status;
    const data = await apiGet<{ gates: any[]; total: number }>("/v1/approvals", query, headers);
    return (data.gates ?? []).map(mapGate);
  }, status && status !== "all"
    ? MOCK_APPROVAL_GATES.filter((g) => g.status === status)
    : MOCK_APPROVAL_GATES);
}

export async function getApprovalGateById(id: string): Promise<ApprovalGate | null> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<any>(`/v1/approvals/${id}`, undefined, headers);
    return mapGate(data);
  }, MOCK_APPROVAL_GATES.find((g) => g.id === id) ?? null);
}

export async function getApprovalStats(): Promise<ApprovalStats> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<ApprovalStats>("/v1/approvals/stats", undefined, headers);
  }, MOCK_APPROVAL_STATS);
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
      "/v1/remediations",
      query,
      headers,
    );
    return data.items ?? [];
  }, filterMockRemediations(filters));
}

export async function getRemediationStats(): Promise<RemediationStats> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<RemediationStats>("/v1/remediations/stats", undefined, headers);
  }, MOCK_REMEDIATION_STATS);
}

export async function getRemediationById(id: string): Promise<RemediationItem | null> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<RemediationItem>(`/v1/remediations/${id}`, undefined, headers);
  }, MOCK_REMEDIATION_ITEMS.find((r) => r.id === id) ?? null);
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
  return apiPost<RemediationItem>("/v1/remediations", data, headers);
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
  return apiPatch<RemediationItem>(`/v1/remediations/${id}`, data, headers);
}

export async function linkRemediationExternal(
  id: string,
  provider: string,
  externalRef: string,
): Promise<RemediationItem> {
  const { apiPost } = await import("./api-client");
  const headers = await getSessionHeaders();
  return apiPost<RemediationItem>(`/v1/remediations/${id}/link`, { provider, externalRef }, headers);
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

function filterMockRemediations(filters?: {
  framework?: string;
  status?: string;
  itemType?: string;
}): RemediationItem[] {
  let items = MOCK_REMEDIATION_ITEMS;
  if (filters?.framework) {
    items = items.filter((i) => i.frameworkSlug === filters.framework);
  }
  if (filters?.status) {
    items = items.filter((i) => i.status === filters.status);
  }
  if (filters?.itemType) {
    items = items.filter((i) => i.itemType === filters.itemType);
  }
  return items;
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
