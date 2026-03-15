// tests/e2e/services/finding-service.ts
import { E2EApiClient } from "./api-client.js";

export interface Finding {
  id: string;
  scanId: string;
  orgId: string;
  agentName: string;
  type: string;
  severity: string;
  category: string | null;
  file: string;
  lineStart: number;
  lineEnd: number;
  title: string | null;
  description: string | null;
  cweId: string | null;
  confidence: number;
  suppressed: boolean;
}

export class FindingService extends E2EApiClient {
  async getFindings(opts?: { scanId?: string; severity?: string }): Promise<{ findings: Finding[]; total: number }> {
    const params = new URLSearchParams();
    if (opts?.scanId) params.set("scanId", opts.scanId);
    if (opts?.severity) params.set("severity", opts.severity);
    const qs = params.toString();
    return this.request("GET", `/v1/findings${qs ? `?${qs}` : ""}`);
  }

  async suppressFinding(findingId: string): Promise<void> {
    await this.request("PATCH", `/v1/findings/${findingId}`, { suppressed: true });
  }

  async unsuppressFinding(findingId: string): Promise<void> {
    await this.request("PATCH", `/v1/findings/${findingId}`, { suppressed: false });
  }
}
