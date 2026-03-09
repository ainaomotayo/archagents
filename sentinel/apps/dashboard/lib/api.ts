/**
 * SENTINEL Dashboard — API Client
 *
 * Abstraction layer for data fetching. Currently returns mock data.
 * When the API is available, swap the implementations to use fetch()
 * against the real SENTINEL API endpoints.
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

// ── Overview ──────────────────────────────────────────────────────────

export async function getOverviewStats(): Promise<OverviewStats> {
  return MOCK_OVERVIEW_STATS;
}

export async function getRecentScans(limit = 5): Promise<Scan[]> {
  return MOCK_SCANS.slice(0, limit);
}

// ── Projects ──────────────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  return MOCK_PROJECTS;
}

export async function getProjectById(id: string): Promise<Project | null> {
  return MOCK_PROJECTS.find((p) => p.id === id) ?? null;
}

export async function getProjectScans(projectId: string): Promise<Scan[]> {
  return MOCK_SCANS.filter((s) => s.projectId === projectId);
}

export async function getProjectFindingCounts(
  _projectId: string,
): Promise<FindingCountByCategory[]> {
  return MOCK_FINDING_COUNTS_BY_CATEGORY;
}

// ── Findings ──────────────────────────────────────────────────────────

export async function getFindings(): Promise<Finding[]> {
  return MOCK_FINDINGS;
}

export async function getFindingById(id: string): Promise<Finding | null> {
  return MOCK_FINDINGS.find((f) => f.id === id) ?? null;
}

// ── Certificates ──────────────────────────────────────────────────────

export async function getCertificates(): Promise<Certificate[]> {
  return MOCK_CERTIFICATES;
}

export async function getCertificateById(
  id: string,
): Promise<Certificate | null> {
  return MOCK_CERTIFICATES.find((c) => c.id === id) ?? null;
}

// ── Certificate for project (latest active) ───────────────────────────

export async function getProjectCertificate(
  projectId: string,
): Promise<Certificate | null> {
  return (
    MOCK_CERTIFICATES.find(
      (c) => c.projectId === projectId && c.status === "active",
    ) ?? null
  );
}
