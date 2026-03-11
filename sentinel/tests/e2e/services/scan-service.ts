// tests/e2e/services/scan-service.ts
import { E2EApiClient } from "./api-client.js";

export interface DiffPayload {
  projectId: string;
  commitHash: string;
  branch: string;
  author: string;
  timestamp: string;
  files: Array<{
    path: string;
    language: string;
    hunks: Array<{
      oldStart: number;
      oldCount: number;
      newStart: number;
      newCount: number;
      content: string;
    }>;
    aiScore: number;
  }>;
  toolHints?: { tool?: string; markers?: string[] };
  scanConfig: {
    securityLevel: "standard" | "strict" | "audit";
    licensePolicy: string;
    qualityThreshold: number;
  };
}

export interface Scan {
  id: string;
  projectId: string;
  orgId: string;
  status: string;
  commitHash: string;
  branch: string;
  riskScore: number | null;
  startedAt: string;
  completedAt: string | null;
  certificate: unknown | null;
  findings: unknown[];
  agentResults: unknown[];
}

export class ScanService extends E2EApiClient {
  async submitDiff(payload: DiffPayload): Promise<{ scanId: string; status: string; pollUrl: string }> {
    return this.request("POST", "/v1/scans", payload);
  }

  async getScan(scanId: string): Promise<Scan> {
    return this.request("GET", `/v1/scans/${scanId}`);
  }

  async listScans(projectId: string): Promise<{ scans: Scan[]; total: number }> {
    return this.request("GET", `/v1/scans?projectId=${projectId}`);
  }

  async pollUntilStatus(
    scanId: string,
    targetStatus: string,
    timeoutMs = 45_000,
  ): Promise<Scan> {
    const deadline = Date.now() + timeoutMs;
    let delay = 200;
    while (Date.now() < deadline) {
      const scan = await this.getScan(scanId);
      if (scan.status === targetStatus) return scan;
      if (scan.status === "failed") throw new Error(`Scan ${scanId} failed`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 1.5, 2000);
    }
    throw new Error(`Scan ${scanId} did not reach status "${targetStatus}" within ${timeoutMs}ms`);
  }
}
