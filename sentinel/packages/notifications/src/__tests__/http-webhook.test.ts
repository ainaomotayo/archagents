import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpWebhookAdapter } from "../adapters/http-webhook.js";
import type { WebhookEndpointConfig, NotificationEvent } from "../types.js";

const endpoint: WebhookEndpointConfig = {
  id: "ep-1",
  orgId: "org-1",
  name: "Test Hook",
  url: "https://example.com/hook",
  channelType: "http",
  secret: "test-secret-key",
  topics: ["scan.completed"],
  headers: { "X-Custom": "value" },
  enabled: true,
};

const event: NotificationEvent = {
  id: "evt-1",
  orgId: "org-1",
  topic: "scan.completed",
  payload: { scanId: "scan-123", riskScore: 42 },
  timestamp: "2026-03-10T12:00:00Z",
};

describe("HttpWebhookAdapter", () => {
  let adapter: HttpWebhookAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    adapter = new HttpWebhookAdapter(fetchSpy as typeof fetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends POST with correct payload and HMAC signature", async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200 });
    const result = await adapter.deliver(endpoint, event);
    expect(result.success).toBe(true);
    expect(result.httpStatus).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://example.com/hook");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.headers["X-Custom"]).toBe("value");
    expect(opts.headers["X-Sentinel-Signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
    const body = JSON.parse(opts.body);
    expect(body.id).toBe("evt-1");
    expect(body.topic).toBe("scan.completed");
  });

  it("returns failure on non-2xx status", async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" });
    const result = await adapter.deliver(endpoint, event);
    expect(result.success).toBe(false);
    expect(result.httpStatus).toBe(500);
    expect(result.error).toContain("500");
  });

  it("returns failure on network error", async () => {
    fetchSpy.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await adapter.deliver(endpoint, event);
    expect(result.success).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("returns failure on timeout via AbortSignal", async () => {
    fetchSpy.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error("AbortError")), 50)),
    );
    const adapter10ms = new HttpWebhookAdapter(fetchSpy as typeof fetch, 50);
    const result = await adapter10ms.deliver(endpoint, event);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("generates valid HMAC-SHA256 signature", async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200 });
    await adapter.deliver(endpoint, event);
    const [, opts] = fetchSpy.mock.calls[0];
    const sig = opts.headers["X-Sentinel-Signature"];
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it("includes custom headers from endpoint config", async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200 });
    await adapter.deliver(endpoint, event);
    const [, opts] = fetchSpy.mock.calls[0];
    expect(opts.headers["X-Custom"]).toBe("value");
  });

  it("records delivery duration", async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200 });
    const result = await adapter.deliver(endpoint, event);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
