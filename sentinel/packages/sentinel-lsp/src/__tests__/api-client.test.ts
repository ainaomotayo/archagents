import { createHmac } from "node:crypto";
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

  it("unsuppressFinding sends PATCH with { suppressed: false }", async () => {
    fetchFn = mockFetch(200, { updated: true });
    client = new SentinelApiClient("https://api.test", "test-secret", "org-123", fetchFn as any);

    await client.unsuppressFinding("finding-42");

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.test/v1/findings/finding-42");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ suppressed: false });
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

  it("getScanStatus sends GET to /v1/scans/:scanId", async () => {
    fetchFn = mockFetch(200, { status: "completed", scanId: "scan-42" });
    client = new SentinelApiClient("https://api.test", "test-secret", "org-123", fetchFn as any);

    const result = await client.getScanStatus("scan-42");

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.test/v1/scans/scan-42");
    expect(init.method).toBe("GET");
    expect(result).toEqual({ status: "completed", scanId: "scan-42" });
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

  describe("HMAC signature verification", () => {
    /** Helper: extract sig header from the nth fetch call */
    function sigFromCall(fn: ReturnType<typeof mockFetch>, index = 0): string {
      return fn.mock.calls[index][1].headers["X-Sentinel-Signature"];
    }

    /** Helper: parse a signature header into its parts */
    function parseSig(sig: string): { timestamp: number; mac: string } {
      const match = sig.match(/^t=(\d+),sig=([a-f0-9]{64})$/);
      if (!match) throw new Error(`Bad signature format: ${sig}`);
      return { timestamp: Number(match[1]), mac: match[2] };
    }

    it("different request bodies produce different signatures", async () => {
      // First request: suppress (body = { suppressed: true })
      const fetch1 = mockFetch(200, { updated: true });
      const c1 = new SentinelApiClient("https://api.test", "test-secret", "org-123", fetch1 as any);
      await c1.suppressFinding("f1");

      // Second request: unsuppress (body = { suppressed: false })
      const fetch2 = mockFetch(200, { updated: true });
      const c2 = new SentinelApiClient("https://api.test", "test-secret", "org-123", fetch2 as any);
      await c2.unsuppressFinding("f1");

      const sig1 = parseSig(sigFromCall(fetch1));
      const sig2 = parseSig(sigFromCall(fetch2));

      // Even if timestamps happen to match, the MAC must differ because bodies differ
      if (sig1.timestamp === sig2.timestamp) {
        expect(sig1.mac).not.toBe(sig2.mac);
      }

      // Verify independently: recompute expected MACs for both bodies
      const body1 = JSON.stringify({ suppressed: true });
      const body2 = JSON.stringify({ suppressed: false });
      const expected1 = createHmac("sha256", "test-secret")
        .update(`${sig1.timestamp}.${body1}`)
        .digest("hex");
      const expected2 = createHmac("sha256", "test-secret")
        .update(`${sig2.timestamp}.${body2}`)
        .digest("hex");

      expect(sig1.mac).toBe(expected1);
      expect(sig2.mac).toBe(expected2);
      expect(expected1).not.toBe(expected2.replace(String(sig2.timestamp), String(sig1.timestamp)));
    });

    it("different secrets produce different signatures for the same body", async () => {
      const fetch1 = mockFetch(200, {});
      const fetch2 = mockFetch(200, {});
      const c1 = new SentinelApiClient("https://api.test", "secret-alpha", "org-123", fetch1 as any);
      const c2 = new SentinelApiClient("https://api.test", "secret-bravo", "org-123", fetch2 as any);

      // Both make the same GET request (empty body)
      await c1.getProjects();
      await c2.getProjects();

      const sig1 = parseSig(sigFromCall(fetch1));
      const sig2 = parseSig(sigFromCall(fetch2));

      // Recompute with each secret to prove they differ
      const mac1 = createHmac("sha256", "secret-alpha")
        .update(`${sig1.timestamp}.`)
        .digest("hex");
      const mac2 = createHmac("sha256", "secret-bravo")
        .update(`${sig2.timestamp}.`)
        .digest("hex");

      expect(sig1.mac).toBe(mac1);
      expect(sig2.mac).toBe(mac2);
      expect(mac1).not.toBe(mac2);
    });

    it("timestamp is within 5 minutes of current time", async () => {
      await client.getProjects();

      const sig = parseSig(sigFromCall(fetchFn));
      const nowSec = Math.floor(Date.now() / 1000);
      const fiveMinutes = 5 * 60;

      expect(Math.abs(nowSec - sig.timestamp)).toBeLessThanOrEqual(fiveMinutes);
    });

    it("replay detection: old timestamp is extractable and detectable", async () => {
      // Freeze time to a known past moment (10 minutes ago)
      const realNow = Date.now();
      const tenMinutesAgo = realNow - 10 * 60 * 1000;
      const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(tenMinutesAgo);

      const oldFetch = mockFetch(200, {});
      const oldClient = new SentinelApiClient("https://api.test", "test-secret", "org-123", oldFetch as any);
      await oldClient.getProjects();

      // Capture the signature before restoring the spy
      const oldSig = parseSig(sigFromCall(oldFetch));

      // Restore only the Date.now spy
      dateNowSpy.mockRestore();

      const currentTimeSec = Math.floor(Date.now() / 1000);
      const ageSec = currentTimeSec - oldSig.timestamp;

      // The old signature's timestamp should be ~600 seconds in the past
      expect(ageSec).toBeGreaterThanOrEqual(599); // allow 1s tolerance
      expect(ageSec).toBeLessThanOrEqual(601);

      // A server enforcing 5-minute expiry would reject this
      const maxAgeSec = 5 * 60;
      expect(ageSec).toBeGreaterThan(maxAgeSec);
    });

    it("signature can be verified by recomputing HMAC with known secret", async () => {
      const secret = "verification-secret";
      const f = mockFetch(200, { scanId: "s1" });
      const c = new SentinelApiClient("https://api.test", secret, "org-123", f as any);

      await c.triggerScan("p1", ["file.ts"]);

      const [, init] = f.mock.calls[0];
      const sig = parseSig(init.headers["X-Sentinel-Signature"]);
      const bodyStr = init.body;

      // Recompute and verify
      const expected = createHmac("sha256", secret)
        .update(`${sig.timestamp}.${bodyStr}`)
        .digest("hex");

      expect(sig.mac).toBe(expected);

      // With a wrong secret, the MAC should NOT match
      const wrong = createHmac("sha256", "wrong-secret")
        .update(`${sig.timestamp}.${bodyStr}`)
        .digest("hex");

      expect(sig.mac).not.toBe(wrong);
    });
  });
});
