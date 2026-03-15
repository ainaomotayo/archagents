// tests/e2e/services/api-client.ts
import { createHmac } from "node:crypto";

export class E2EApiClient {
  constructor(
    protected readonly baseUrl: string,
    protected readonly secret: string,
    protected readonly orgId: string,
  ) {}

  protected sign(body: string): string {
    const ts = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", this.secret)
      .update(`${ts}.${body}`)
      .digest("hex");
    return `t=${ts},sig=${sig}`;
  }

  async request<T>(method: string, path: string, body?: unknown, role = "admin"): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const bodyStr = body != null ? JSON.stringify(body) : "";
    const headers: Record<string, string> = {
      "x-sentinel-signature": this.sign(bodyStr),
      "x-sentinel-api-key": "e2e-test-client",
      "x-sentinel-role": role,
      "x-sentinel-org-id": this.orgId,
      "content-type": "application/json",
    };
    const init: RequestInit = { method, headers };
    if (body != null) init.body = bodyStr;

    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`E2E API ${method} ${path} failed: ${res.status} ${text}`);
    }
    return res.json() as Promise<T>;
  }
}
