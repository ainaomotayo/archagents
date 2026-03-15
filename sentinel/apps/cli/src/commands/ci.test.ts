import { describe, it, expect, vi } from "vitest";
import type { ComplianceAssessment, Finding, SecurityFinding, LicenseFinding } from "@sentinel/shared";
import {
  exitCodeFromStatus,
  formatSummary,
  formatSarif,
  pollForResult,
  runCi,
  EXIT_PASS,
  EXIT_FAIL,
  EXIT_ERROR,
  EXIT_PROVISIONAL,
} from "./ci.js";

// ── Fixtures ───────────────────────────────────────────────────────

function makeCategoryScore(
  status: "pass" | "warn" | "fail" | "error" = "pass",
  findings = { critical: 0, high: 0, medium: 0, low: 0 },
) {
  return { score: 90, status, findings };
}

function makeAssessment(overrides: Partial<ComplianceAssessment> = {}): ComplianceAssessment {
  return {
    id: "assess-1",
    commitHash: "abc123",
    projectId: "proj-1",
    timestamp: "2026-03-09T00:00:00Z",
    status: "full_pass",
    riskScore: 12,
    categories: {
      security: makeCategoryScore("pass"),
      license: makeCategoryScore("pass", { critical: 0, high: 0, medium: 1, low: 0 }),
      quality: makeCategoryScore("pass"),
      policy: makeCategoryScore("pass"),
      dependency: makeCategoryScore("pass"),
    },
    findings: [],
    agentResults: [],
    drift: {
      aiComposition: {
        thisCommit: 0.3,
        projectBaseline: 0.2,
        deviationFactor: 1.5,
        riskFlag: false,
        trend: "stable",
      },
      dependencyDrift: { newDeps: [], categoryConflicts: [] },
    },
    ...overrides,
  };
}

function makeSecurityFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  return {
    type: "security",
    file: "src/auth.ts",
    lineStart: 10,
    lineEnd: 15,
    severity: "high",
    confidence: "high",
    category: "injection",
    title: "SQL Injection",
    description: "User input passed to query without sanitization",
    remediation: "Use parameterized queries",
    scanner: "semgrep",
    cweId: "CWE-89",
    ...overrides,
  };
}

function makeLicenseFinding(overrides: Partial<LicenseFinding> = {}): LicenseFinding {
  return {
    type: "license",
    file: "lib/util.ts",
    lineStart: 1,
    lineEnd: 20,
    severity: "medium",
    confidence: "medium",
    findingType: "copyleft-risk",
    licenseDetected: "GPL-3.0",
    similarityScore: 0.85,
    sourceMatch: "github.com/example/lib",
    policyAction: "block",
    ...overrides,
  };
}

// ── Helper to build a mock fetch ───────────────────────────────────

function mockFetch(responses: Array<{ status: number; body: unknown; statusText?: string }>) {
  let callIndex = 0;
  return vi.fn(async () => {
    const resp = responses[callIndex++];
    if (!resp) throw new Error("Unexpected fetch call");
    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      statusText: resp.statusText ?? "OK",
      json: async () => resp.body,
    } as unknown as Response;
  });
}

// ── Tests ──────────────────────────────────────────────────────────

describe("exitCodeFromStatus", () => {
  it("returns 0 for full_pass", () => {
    expect(exitCodeFromStatus("full_pass")).toBe(EXIT_PASS);
  });

  it("returns 1 for fail", () => {
    expect(exitCodeFromStatus("fail")).toBe(EXIT_FAIL);
  });

  it("returns 1 for revoked", () => {
    expect(exitCodeFromStatus("revoked")).toBe(EXIT_FAIL);
  });

  it("returns 3 for provisional_pass", () => {
    expect(exitCodeFromStatus("provisional_pass")).toBe(EXIT_PROVISIONAL);
  });

  it("returns 3 for partial", () => {
    expect(exitCodeFromStatus("partial")).toBe(EXIT_PROVISIONAL);
  });
});

describe("formatSummary", () => {
  it("produces human-readable output with status and risk score", () => {
    const assessment = makeAssessment({ status: "full_pass", riskScore: 23 });
    const output = formatSummary(assessment);

    expect(output).toContain("SENTINEL Scan Report");
    expect(output).toContain("Status: PASS");
    expect(output).toContain("Risk Score: 23/100");
    expect(output).toContain("Categories:");
    expect(output).toContain("Security: pass (0 findings)");
    expect(output).toContain("License: pass (1 finding)");
  });

  it("shows certificate info when present", () => {
    const assessment = makeAssessment({
      certificate: {
        id: "cert-123",
        version: "1.0",
        subject: {
          projectId: "proj-1",
          repository: "repo",
          commitHash: "abc",
          branch: "main",
          author: "dev",
          timestamp: "2026-03-09T00:00:00Z",
        },
        verdict: { status: "pass", riskScore: 10, categories: {} },
        scanMetadata: {
          agents: [],
          environmentHash: "hash",
          totalDurationMs: 5000,
          scanLevel: "standard",
        },
        compliance: {},
        signature: "sig",
        issuedAt: "2026-03-09T00:00:00Z",
        expiresAt: "2026-04-09T00:00:00Z",
      },
    });
    const output = formatSummary(assessment);
    expect(output).toContain("Certificate: cert-123");
    expect(output).toContain("Verdict: PASS");
    expect(output).toContain("Expires: 2026-04-09T00:00:00Z");
  });

  it("shows FAIL status label for failed assessments", () => {
    const assessment = makeAssessment({
      status: "fail",
      categories: {
        security: makeCategoryScore("fail", { critical: 1, high: 2, medium: 0, low: 0 }),
        license: makeCategoryScore("pass"),
        quality: makeCategoryScore("pass"),
        policy: makeCategoryScore("pass"),
        dependency: makeCategoryScore("pass"),
      },
    });
    const output = formatSummary(assessment);
    expect(output).toContain("Status: FAIL");
    expect(output).toContain("Security: FAIL (3 findings)");
  });
});

describe("formatSarif", () => {
  it("produces valid SARIF 2.1.0 structure", () => {
    const findings: Finding[] = [makeSecurityFinding()];
    const sarif = formatSarif(findings) as Record<string, unknown>;

    expect(sarif.version).toBe("2.1.0");
    expect(sarif.$schema).toContain("sarif-schema-2.1.0");

    const runs = sarif.runs as Array<Record<string, unknown>>;
    expect(runs).toHaveLength(1);

    const run = runs[0];
    const tool = run.tool as { driver: { name: string } };
    expect(tool.driver.name).toBe("SENTINEL");

    const results = run.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe("sentinel/security");
    expect(results[0].level).toBe("error");
  });

  it("maps severity to SARIF levels correctly", () => {
    const findings: Finding[] = [
      makeSecurityFinding({ severity: "critical" }),
      makeLicenseFinding({ severity: "medium" }),
      makeSecurityFinding({ severity: "low" }),
    ];
    const sarif = formatSarif(findings) as { runs: Array<{ results: Array<{ level: string }> }> };
    const levels = sarif.runs[0].results.map((r) => r.level);
    expect(levels).toEqual(["error", "warning", "note"]);
  });

  it("includes file location info", () => {
    const findings: Finding[] = [makeSecurityFinding({ file: "src/foo.ts", lineStart: 5, lineEnd: 10 })];
    const sarif = formatSarif(findings) as {
      runs: Array<{
        results: Array<{
          locations: Array<{
            physicalLocation: {
              artifactLocation: { uri: string };
              region: { startLine: number; endLine: number };
            };
          }>;
        }>;
      }>;
    };
    const loc = sarif.runs[0].results[0].locations[0].physicalLocation;
    expect(loc.artifactLocation.uri).toBe("src/foo.ts");
    expect(loc.region.startLine).toBe(5);
    expect(loc.region.endLine).toBe(10);
  });
});

describe("pollForResult", () => {
  it("returns assessment when scan completes immediately", async () => {
    const assessment = makeAssessment();
    const fetch = mockFetch([
      { status: 200, body: { status: "full_pass", assessment } },
    ]);

    const result = await pollForResult("scan-1", {
      apiUrl: "http://localhost:8080",
      timeout: 10,
      secret: "test-secret",
      fetchFn: fetch,
    });

    expect(result.status).toBe("full_pass");
    expect(result.assessment).toEqual(assessment);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("polls multiple times when status is pending then completes", async () => {
    const assessment = makeAssessment({ status: "fail" });
    const fetch = mockFetch([
      { status: 200, body: { status: "pending" } },
      { status: 200, body: { status: "scanning" } },
      { status: 200, body: { status: "fail", assessment } },
    ]);

    const result = await pollForResult("scan-2", {
      apiUrl: "http://localhost:8080",
      timeout: 30,
      secret: "test-secret",
      fetchFn: fetch,
    });

    expect(result.status).toBe("fail");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("throws on API error", async () => {
    const fetch = mockFetch([
      { status: 500, body: {}, statusText: "Internal Server Error" },
    ]);

    await expect(
      pollForResult("scan-3", {
        apiUrl: "http://localhost:8080",
        timeout: 10,
        secret: "test-secret",
        fetchFn: fetch,
      }),
    ).rejects.toThrow("Poll error: 500 Internal Server Error");
  });

  it("uses exponential backoff intervals", async () => {
    const delays: number[] = [];
    const origSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: Function, ms?: number) => {
      if (ms && ms >= 500) delays.push(ms);
      return origSetTimeout(fn, 0); // Execute immediately for speed
    }) as any);

    let callCount = 0;
    const mockFetch = vi.fn(async () => {
      callCount++;
      if (callCount <= 4) {
        return new Response(JSON.stringify({ status: "pending" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ status: "full_pass", assessment: { status: "full_pass" } }),
        { status: 200 },
      );
    });

    await pollForResult("scan-backoff", {
      apiUrl: "http://localhost",
      timeout: 120,
      secret: "test-secret",
      fetchFn: mockFetch as any,
    });

    // Should have 4 delays (for the 4 pending responses)
    expect(delays.length).toBe(4);
    // Verify exponential progression (ignore jitter for ordering)
    // Intervals should be approximately: 1000, 2000, 4000, 8000 (plus 0-500 jitter)
    expect(delays[0]).toBeGreaterThanOrEqual(1000);
    expect(delays[0]).toBeLessThanOrEqual(1500);
    expect(delays[1]).toBeGreaterThanOrEqual(2000);
    expect(delays[1]).toBeLessThanOrEqual(2500);
    expect(delays[2]).toBeGreaterThanOrEqual(4000);
    expect(delays[2]).toBeLessThanOrEqual(4500);
    expect(delays[3]).toBeGreaterThanOrEqual(8000);
    expect(delays[3]).toBeLessThanOrEqual(8500);

    vi.restoreAllMocks();
  });

  it("throws on timeout", async () => {
    // Always return pending — with timeout=0 it should time out immediately
    const fetch = mockFetch([
      { status: 200, body: { status: "pending" } },
    ]);

    await expect(
      pollForResult("scan-4", {
        apiUrl: "http://localhost:8080",
        timeout: 0,
        secret: "test-secret",
        fetchFn: fetch,
      }),
    ).rejects.toThrow("Scan timed out after 0s");
  });
});

describe("runCi", () => {
  it("returns EXIT_PASS for a passing scan", async () => {
    const assessment = makeAssessment({ status: "full_pass" });
    const fetch = mockFetch([
      { status: 200, body: { scanId: "scan-ok" } },
      { status: 200, body: { status: "full_pass", assessment } },
    ]);

    const code = await runCi({
      apiUrl: "http://localhost:8080",
      apiKey: "key",
      secret: "secret",
      timeout: 10,
      json: false,
      sarif: false,
      fetchFn: fetch,
      stdinContent: "diff --git a/file.ts\n+new line",
    });

    expect(code).toBe(EXIT_PASS);
  });

  it("returns EXIT_FAIL for a failing scan", async () => {
    const assessment = makeAssessment({ status: "fail" });
    const fetch = mockFetch([
      { status: 200, body: { scanId: "scan-fail" } },
      { status: 200, body: { status: "fail", assessment } },
    ]);

    const code = await runCi({
      apiUrl: "http://localhost:8080",
      apiKey: "key",
      secret: "secret",
      timeout: 10,
      json: false,
      sarif: false,
      fetchFn: fetch,
      stdinContent: "diff --git a/file.ts\n+new line",
    });

    expect(code).toBe(EXIT_FAIL);
  });

  it("returns EXIT_ERROR when no stdin is provided", async () => {
    const code = await runCi({
      apiUrl: "http://localhost:8080",
      apiKey: "key",
      secret: "secret",
      timeout: 10,
      json: false,
      sarif: false,
      stdinContent: "",
    });

    expect(code).toBe(EXIT_ERROR);
  });

  it("returns EXIT_ERROR when API submission fails", async () => {
    const fetch = mockFetch([
      { status: 401, body: {}, statusText: "Unauthorized" },
    ]);

    const code = await runCi({
      apiUrl: "http://localhost:8080",
      apiKey: "bad-key",
      secret: "secret",
      timeout: 10,
      json: false,
      sarif: false,
      fetchFn: fetch,
      stdinContent: "diff --git a/file.ts\n+new line",
    });

    expect(code).toBe(EXIT_ERROR);
  });

  it("outputs JSON when --json flag is set", async () => {
    const assessment = makeAssessment({ status: "full_pass" });
    const fetch = mockFetch([
      { status: 200, body: { scanId: "scan-json" } },
      { status: 200, body: { status: "full_pass", assessment } },
    ]);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCi({
      apiUrl: "http://localhost:8080",
      apiKey: "key",
      secret: "secret",
      timeout: 10,
      json: true,
      sarif: false,
      fetchFn: fetch,
      stdinContent: "diff content",
    });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.status).toBe("full_pass");

    consoleSpy.mockRestore();
  });

  it("outputs SARIF when --sarif flag is set", async () => {
    const findings: Finding[] = [makeSecurityFinding()];
    const assessment = makeAssessment({ status: "fail", findings });
    const fetch = mockFetch([
      { status: 200, body: { scanId: "scan-sarif" } },
      { status: 200, body: { status: "fail", assessment } },
    ]);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCi({
      apiUrl: "http://localhost:8080",
      apiKey: "key",
      secret: "secret",
      timeout: 10,
      json: false,
      sarif: true,
      fetchFn: fetch,
      stdinContent: "diff content",
    });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.version).toBe("2.1.0");
    expect(output.runs[0].results).toHaveLength(1);

    consoleSpy.mockRestore();
  });
});
