import { describe, it, expect, vi } from "vitest";
import { WebhookAdapter } from "./webhook.js";
import type { ArchivePayload, ArchiveConfig } from "../ports/archive-port.js";

const adapter = new WebhookAdapter();

const config: ArchiveConfig = {
  type: "webhook",
  config: { url: "https://example.com/archive", authHeader: "Authorization", authValue: "Bearer tok" },
};

const payload: ArchivePayload = {
  orgId: "org-1",
  executionId: "exec-1",
  dataType: "findings",
  records: [{ id: "f1", severity: "high" }, { id: "f2", severity: "low" }],
  metadata: { severity: "high", cutoffDate: "2026-01-01", exportedAt: "2026-03-18" },
};

describe("WebhookAdapter", () => {
  it("has type 'webhook'", () => {
    expect(adapter.type).toBe("webhook");
  });

  it("archives records via POST", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await adapter.archive(payload, config, mockFetch);
    expect(result.success).toBe(true);
    expect(result.recordCount).toBe(2);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://example.com/archive");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Authorization"]).toBe("Bearer tok");
  });

  it("returns error on non-2xx response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "Internal Error" });
    const result = await adapter.archive(payload, config, mockFetch);
    expect(result.success).toBe(false);
    expect(result.error).toContain("500");
  });

  it("testConnection sends test payload", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await adapter.testConnection(config, mockFetch);
    expect(result.ok).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.type).toBe("sentinel.archive.test");
  });
});
