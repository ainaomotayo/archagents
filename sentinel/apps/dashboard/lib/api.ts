/**
 * SENTINEL Dashboard — API Client
 *
 * Fetches data from the SENTINEL API when available.
 * Falls back to mock data when API is unreachable (dev/demo mode).
 */

import type {
  Certificate,
  Finding,
  FindingCountByCategory,
  OverviewStats,
  Project,
  Scan,
} from "./types";

import {
  MOCK_CERTIFICATES,
  MOCK_FINDING_COUNTS_BY_CATEGORY,
  MOCK_FINDINGS,
  MOCK_OVERVIEW_STATS,
  MOCK_PROJECTS,
  MOCK_SCANS,
} from "./mock-data";

const USE_MOCK = !process.env.SENTINEL_API_URL;

async function tryApi<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (USE_MOCK) return fallback;
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

// ── Overview ──────────────────────────────────────────────────────────

export async function getOverviewStats(): Promise<OverviewStats> {
  return tryApi(async () => {
    const { apiGet } = await import("./api-client");
    const [scansData, findingsData, certsData] = await Promise.all([
      apiGet<{ total: number }>("/v1/findings", { limit: "0" }),
      apiGet<{ total: number }>("/v1/findings", { limit: "0" }),
      apiGet<{ certificates: any[]; total: number }>("/v1/certificates", { limit: "100" }),
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
  return tryApi(async () => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<any[]>("/v1/projects");
    // For now return mock scans — the /v1/scans list endpoint needs to be added
    return MOCK_SCANS.slice(0, limit);
  }, MOCK_SCANS.slice(0, limit));
}

// ── Projects ──────────────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  return tryApi(async () => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<any[]>("/v1/projects");
    return data.map((p: any) => ({
      id: p.id,
      name: p.name,
      repoUrl: p.repoUrl ?? "",
      lastScanDate: p.scans?.[0]?.startedAt ?? null,
      lastScanStatus: p.scans?.[0]?.status ?? null,
      findingCount: 0,
      scanCount: p._count?.scans ?? 0,
    }));
  }, MOCK_PROJECTS);
}

export async function getProjectById(id: string): Promise<Project | null> {
  return tryApi(async () => {
    const { apiGet } = await import("./api-client");
    const p = await apiGet<any>(`/v1/projects/${id}`);
    return {
      id: p.id,
      name: p.name,
      repoUrl: p.repoUrl ?? "",
      lastScanDate: p.scans?.[0]?.startedAt ?? null,
      lastScanStatus: p.scans?.[0]?.status ?? null,
      findingCount: 0,
      scanCount: p._count?.scans ?? 0,
    };
  }, MOCK_PROJECTS.find((p) => p.id === id) ?? null);
}

export async function getProjectScans(projectId: string): Promise<Scan[]> {
  return tryApi(async () => {
    const { apiGet } = await import("./api-client");
    const p = await apiGet<any>(`/v1/projects/${projectId}`);
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
  _projectId: string,
): Promise<FindingCountByCategory[]> {
  // TODO: Add a dedicated API endpoint for this
  return MOCK_FINDING_COUNTS_BY_CATEGORY;
}

// ── Findings ──────────────────────────────────────────────────────────

export async function getFindings(): Promise<Finding[]> {
  return tryApi(async () => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<{ findings: any[] }>("/v1/findings", { limit: "100" });
    return (data.findings ?? []).map((f: any) => ({
      id: f.id,
      projectId: f.orgId,
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
      codeSnippet: "",
      remediation: f.remediation ?? "",
      createdAt: f.createdAt,
    }));
  }, MOCK_FINDINGS);
}

export async function getFindingById(id: string): Promise<Finding | null> {
  return tryApi(async () => {
    const { apiGet } = await import("./api-client");
    const f = await apiGet<any>(`/v1/findings/${id}`);
    return {
      id: f.id,
      projectId: f.orgId,
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
      codeSnippet: "",
      remediation: f.remediation ?? "",
      createdAt: f.createdAt,
    };
  }, MOCK_FINDINGS.find((f) => f.id === id) ?? null);
}

// ── Certificates ──────────────────────────────────────────────────────

export async function getCertificates(): Promise<Certificate[]> {
  return tryApi(async () => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<{ certificates: any[] }>("/v1/certificates", { limit: "100" });
    return (data.certificates ?? []).map((c: any) => ({
      id: c.id,
      projectId: c.orgId,
      scanId: c.scanId,
      commit: "",
      branch: "",
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
  return tryApi(async () => {
    const { apiGet } = await import("./api-client");
    const c = await apiGet<any>(`/v1/certificates/${id}`);
    return {
      id: c.id,
      projectId: c.orgId,
      scanId: c.scanId,
      commit: "",
      branch: "",
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
  return tryApi(async () => {
    const { apiGet } = await import("./api-client");
    return apiGet<any[]>("/v1/policies");
  }, []);
}

export async function getPolicyById(id: string) {
  return tryApi(async () => {
    const { apiGet } = await import("./api-client");
    const policies = await apiGet<any[]>("/v1/policies");
    return policies.find((p: any) => p.id === id) ?? null;
  }, null);
}

// ── Audit Log ─────────────────────────────────────────────────────────

export async function getAuditLog(limit = 50) {
  return tryApi(async () => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<{ events: any[] }>("/v1/audit", { limit: String(limit) });
    return data.events ?? [];
  }, []);
}
