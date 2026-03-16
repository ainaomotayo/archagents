"use server";

// Wizard API client — server actions for Next.js
// Uses the same session headers pattern as lib/api.ts

const API_BASE = process.env.SENTINEL_API_URL ?? "http://localhost:8080";

async function wizardFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Import getSessionHeaders dynamically to avoid circular deps
  const { getServerSession } = await import("next-auth");
  const { authOptions } = await import("./auth");
  const session = await getServerSession(authOptions);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };

  if (session?.user) {
    if ((session.user as any).role) headers["X-Sentinel-Role"] = (session.user as any).role;
    if ((session.user as any).orgId) headers["X-Sentinel-Org-Id"] = (session.user as any).orgId;
    if ((session.user as any).id) headers["X-Sentinel-User-Id"] = (session.user as any).id;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `API error: ${res.status}`);
  }

  return res.json();
}

import type { Wizard, WizardStep, WizardProgress, WizardDocument } from "./wizard-types";

export async function fetchWizards(): Promise<Wizard[]> {
  return wizardFetch("/v1/compliance/wizards");
}

export async function fetchWizard(wizardId: string): Promise<Wizard> {
  return wizardFetch(`/v1/compliance/wizards/${wizardId}`);
}

export async function createWizard(name: string, frameworkCode = "eu_ai_act"): Promise<Wizard> {
  return wizardFetch("/v1/compliance/wizards", {
    method: "POST",
    body: JSON.stringify({ name, frameworkCode }),
  });
}

export async function deleteWizard(wizardId: string): Promise<void> {
  await wizardFetch(`/v1/compliance/wizards/${wizardId}`, { method: "DELETE" });
}

export async function updateWizardMetadata(wizardId: string, metadata: Record<string, unknown>): Promise<Wizard> {
  return wizardFetch(`/v1/compliance/wizards/${wizardId}`, {
    method: "PATCH",
    body: JSON.stringify({ metadata }),
  });
}

export async function fetchStep(wizardId: string, code: string): Promise<WizardStep> {
  return wizardFetch(`/v1/compliance/wizards/${wizardId}/steps/${code}`);
}

export async function updateStep(
  wizardId: string,
  code: string,
  data: { justification?: string; requirements?: Array<{ key: string; completed: boolean }> },
): Promise<WizardStep> {
  return wizardFetch(`/v1/compliance/wizards/${wizardId}/steps/${code}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function completeStep(wizardId: string, code: string): Promise<WizardStep> {
  return wizardFetch(`/v1/compliance/wizards/${wizardId}/steps/${code}/complete`, {
    method: "POST",
    body: "{}",
  });
}

export async function skipStep(wizardId: string, code: string, reason: string): Promise<WizardStep> {
  return wizardFetch(`/v1/compliance/wizards/${wizardId}/steps/${code}/skip`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function fetchProgress(wizardId: string): Promise<WizardProgress> {
  return wizardFetch(`/v1/compliance/wizards/${wizardId}/progress`);
}

export async function generateDocuments(wizardId: string, documentTypes: string[]): Promise<{ documents: WizardDocument[] }> {
  return wizardFetch(`/v1/compliance/wizards/${wizardId}/documents/generate`, {
    method: "POST",
    body: JSON.stringify({ documentTypes }),
  });
}

export async function fetchDocuments(wizardId: string): Promise<WizardDocument[]> {
  return wizardFetch(`/v1/compliance/wizards/${wizardId}/documents`);
}

export async function uploadEvidence(
  wizardId: string,
  code: string,
  file: { fileName: string; mimeType: string; fileSize: number; sha256: string },
): Promise<{ evidence: import("./wizard-types").WizardEvidence }> {
  return wizardFetch(`/v1/compliance/wizards/${wizardId}/steps/${code}/evidence`, {
    method: "POST",
    body: JSON.stringify(file),
  });
}

export async function deleteEvidence(
  wizardId: string,
  code: string,
  evidenceId: string,
): Promise<void> {
  await wizardFetch(`/v1/compliance/wizards/${wizardId}/steps/${code}/evidence/${evidenceId}`, {
    method: "DELETE",
  });
}
