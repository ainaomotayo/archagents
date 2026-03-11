import { describe, it, expect, vi, beforeEach } from "vitest";
import { SentinelApiClient } from "../api-client.js";

const SIG_PATTERN = /^t=\d+,sig=[a-f0-9]{64}$/;

function mockFetch(status = 200, body: unknown = {}) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Unauthorized",
    json: () => Promise.resolve(body),
  });
}

describe("SentinelApiClient", () => {
  let fetchFn: ReturnType<typeof mockFetch>;
  let client: SentinelApiClient;

  beforeEach(() => {
    fetchFn = mockFetch(200, { data: [] });
    client = new SentinelApiClient("https://api.test", "test-secret", "org-123", fetchFn as any);
  });

  it("getFindings sends signed GET request", async () => {
    await client.getFindings({ projectId: "p1" });

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain("/v1/findings");
    expect(init.method).toBe("GET");
    expect(init.headers["X-Sentinel-Signature"]).toMatch(SIG_PATTERN);
    expect(init.headers["X-Sentinel-Org-Id"]).toBe("org-123");
  });

  it("suppressFinding sends PATCH with { suppressed: true }", async () => {
    fetchFn = mockFetch(200, { updated: true });
    client = new SentinelApiClient("https://api.test", "test-secret", "org-123", fetchFn as any);

    await client.suppressFinding("finding-42");

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.test/v1/findings/finding-42");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ suppressed: true });
  });

  it("triggerScan sends POST to /v1/scans and returns { scanId }", async () => {
    fetchFn = mockFetch(200, { scanId: "scan-99" });
    client = new SentinelApiClient("https://api.test", "test-secret", "org-123", fetchFn as any);

    const result = await client.triggerScan("proj-1", ["src/app.ts"]);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.test/v1/scans");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ projectId: "proj-1", files: ["src/app.ts"] });
    expect(result).toEqual({ scanId: "scan-99" });
  });

  it("throws on non-OK response", async () => {
    fetchFn = mockFetch(401);
    client = new SentinelApiClient("https://api.test", "test-secret", "org-123", fetchFn as any);

    await expect(client.getFindings()).rejects.toThrow("API request failed: 401 Unauthorized");
  });

  it("HMAC signature uses correct format pattern", async () => {
    await client.getProjects();

    const [, init] = fetchFn.mock.calls[0];
    const sig = init.headers["X-Sentinel-Signature"];
    expect(sig).toMatch(SIG_PATTERN);
    // Verify it contains a unix timestamp and 64-char hex digest
    const parts = sig.split(",");
    expect(parts[0]).toMatch(/^t=\d{10}$/);
    expect(parts[1]).toMatch(/^sig=[a-f0-9]{64}$/);
  });
});
