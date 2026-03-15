// tests/e2e/services/report-service.ts
import { E2EApiClient } from "./api-client.js";

export interface Report {
  id: string;
  orgId: string;
  type: string;
  status: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export class ReportService extends E2EApiClient {
  async generateReport(type: string, opts?: Record<string, unknown>): Promise<Report> {
    return this.request("POST", "/v1/reports", { type, ...opts });
  }

  async listReports(): Promise<{ reports: Report[]; total: number }> {
    return this.request("GET", "/v1/reports");
  }

  async getReport(id: string): Promise<Report> {
    return this.request("GET", `/v1/reports/${id}`);
  }
}
