import { createHmac } from "node:crypto";

export interface FindingsQuery {
  projectId?: string;
  severity?: string;
  suppressed?: boolean;
  limit?: number;
  offset?: number;
}

export class SentinelApiClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly orgId: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(
    baseUrl: string,
    apiToken: string,
    orgId: string,
    fetchFn: typeof globalThis.fetch = globalThis.fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiToken = apiToken;
    this.orgId = orgId;
    this.fetchFn = fetchFn;
  }

  private signRequest(body: string, secret: string): string {
    const ts = Math.floor(Date.now() / 1000);
    const mac = createHmac("sha256", secret)
      .update(`${ts}.${body}`)
      .digest("hex");
    return `t=${ts},sig=${mac}`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const bodyStr = body != null ? JSON.stringify(body) : "";
    const signature = this.signRequest(bodyStr, this.apiToken);

    const headers: Record<string, string> = {
      "X-Sentinel-Signature": signature,
      "X-Sentinel-Org-Id": this.orgId,
      "Content-Type": "application/json",
    };

    const init: RequestInit = { method, headers };
    if (body != null) {
      init.body = bodyStr;
    }

    const res = await this.fetchFn(url, init);
    if (!res.ok) {
      throw new Error(`API request failed: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  async getFindings(opts?: FindingsQuery): Promise<unknown> {
    const params = new URLSearchParams();
    if (opts) {
      if (opts.projectId) params.set("projectId", opts.projectId);
      if (opts.severity) params.set("severity", opts.severity);
      if (opts.suppressed !== undefined) params.set("suppressed", String(opts.suppressed));
      if (opts.limit !== undefined) params.set("limit", String(opts.limit));
      if (opts.offset !== undefined) params.set("offset", String(opts.offset));
    }
    const qs = params.toString();
    const path = `/v1/findings${qs ? `?${qs}` : ""}`;
    return this.request("GET", path);
  }

  async suppressFinding(findingId: string): Promise<unknown> {
    return this.request("PATCH", `/v1/findings/${findingId}`, { suppressed: true });
  }

  async unsuppressFinding(findingId: string): Promise<unknown> {
    return this.request("PATCH", `/v1/findings/${findingId}`, { suppressed: false });
  }

  async triggerScan(projectId: string, files: string[]): Promise<unknown> {
    return this.request("POST", "/v1/scans", { projectId, files });
  }

  async getProjects(): Promise<unknown> {
    return this.request("GET", "/v1/projects");
  }
}
