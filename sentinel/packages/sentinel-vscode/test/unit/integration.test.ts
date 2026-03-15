import { describe, it, expect, vi } from "vitest";

describe("Extension integration", () => {
  it("defaultConfig matches package.json defaults", async () => {
    const { defaultConfig } = await import("../../src/context.js");
    expect(defaultConfig.apiUrl).toBe("http://localhost:8080");
    expect(defaultConfig.orgId).toBe("default");
    expect(defaultConfig.projectId).toBe("");
    expect(defaultConfig.enableGutterIcons).toBe(true);
    expect(defaultConfig.autoScanOnSave).toBe(false);
    expect(defaultConfig.autoScanDebounceMs).toBe(2000);
    expect(defaultConfig.severityThreshold).toBe("info");
  });

  it("all severity levels have correct order", async () => {
    const { severityOrder } = await import("../../src/context.js");
    const severities = Object.keys(severityOrder);
    expect(severities).toContain("critical");
    expect(severities).toContain("high");
    expect(severities).toContain("medium");
    expect(severities).toContain("low");
    expect(severities).toContain("info");
    expect(severities).toHaveLength(5);
  });

  it("TreeView provider handles rapid updates without error", async () => {
    const { FindingsTreeProvider } = await import("../../src/features/tree-view.js");
    const provider = new FindingsTreeProvider();
    const makeFinding = (id: string, sev: string) => ({
      id, scanId: "s1", orgId: "o1", agentName: "security", type: "vulnerability",
      severity: sev, category: null, file: "a.ts", lineStart: 1, lineEnd: 1,
      title: `Finding ${id}`, description: null, remediation: null, cweId: null,
      confidence: 0.9, suppressed: false, createdAt: "2026-01-01",
    });

    // Rapid updates shouldn't throw
    for (let i = 0; i < 100; i++) {
      provider.updateFindings([makeFinding(`f${i}`, "critical")]);
    }
    const roots = provider.getChildren(undefined);
    expect(roots).toHaveLength(1);
  });

  it("TreeView handles all severity levels correctly", async () => {
    const { FindingsTreeProvider, SeverityGroup } = await import("../../src/features/tree-view.js");
    const provider = new FindingsTreeProvider();
    const makeFinding = (id: string, sev: string) => ({
      id, scanId: "s1", orgId: "o1", agentName: "security", type: "vulnerability",
      severity: sev, category: null, file: "a.ts", lineStart: 1, lineEnd: 1,
      title: `Finding ${id}`, description: null, remediation: null, cweId: null,
      confidence: 0.9, suppressed: false, createdAt: "2026-01-01",
    });

    provider.updateFindings([
      makeFinding("1", "critical"),
      makeFinding("2", "high"),
      makeFinding("3", "medium"),
      makeFinding("4", "low"),
      makeFinding("5", "info"),
    ]);
    const roots = provider.getChildren(undefined);
    expect(roots).toHaveLength(5);
    // Verify order: critical, high, medium, low, info
    expect((roots[0] as SeverityGroup).severity).toBe("critical");
    expect((roots[1] as SeverityGroup).severity).toBe("high");
    expect((roots[2] as SeverityGroup).severity).toBe("medium");
    expect((roots[3] as SeverityGroup).severity).toBe("low");
    expect((roots[4] as SeverityGroup).severity).toBe("info");
  });

  it("detail HTML escapes XSS in finding data", async () => {
    const { renderDetailHtml } = await import("../../src/features/detail-html.js");
    const xssFinding = {
      id: "f1", scanId: "s1", orgId: "o1", agentName: "security",
      type: "vulnerability", severity: "critical", category: "xss",
      file: "src/a.ts", lineStart: 1, lineEnd: 1,
      title: '<script>alert("xss")</script>',
      description: '<img onerror="alert(1)" src="x">',
      remediation: null, cweId: null, confidence: 0.9,
      suppressed: false, createdAt: "2026-01-01T00:00:00Z",
    };
    const html = renderDetailHtml(xssFinding, {});
    expect(html).not.toContain('<script>alert');
    expect(html).toContain("&lt;script&gt;");
    // The img tag should be escaped so browsers won't execute it
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });

  it("gutter computeGutterRanges handles duplicate lines correctly", async () => {
    const { computeGutterRanges } = await import("../../src/features/gutter-icons.js");
    // Same line, different severities - should pick most severe
    const diagnostics = [
      { range: { start: { line: 5 }, end: { line: 5 } }, source: "sentinel/a", severity: 3 }, // info
      { range: { start: { line: 5 }, end: { line: 5 } }, source: "sentinel/b", severity: 0 }, // critical
      { range: { start: { line: 5 }, end: { line: 5 } }, source: "sentinel/c", severity: 1 }, // high
    ];
    const result = computeGutterRanges(diagnostics as any);
    expect(result.get("critical")).toHaveLength(1);
    expect(result.has("info")).toBe(false);
    expect(result.has("high")).toBe(false);
  });

  it("createDebouncedScanner accumulates duplicate file saves", async () => {
    vi.useFakeTimers();
    const { createDebouncedScanner } = await import("../../src/features/scan-trigger.js");
    const triggerScan = vi.fn().mockResolvedValue(undefined);
    const scanner = createDebouncedScanner(triggerScan, 100);

    scanner.onSave("/workspace/a.ts");
    scanner.onSave("/workspace/a.ts");
    scanner.onSave("/workspace/a.ts");
    await vi.advanceTimersByTimeAsync(100);

    expect(triggerScan).toHaveBeenCalledTimes(1);
    expect(triggerScan).toHaveBeenCalledWith(["/workspace/a.ts", "/workspace/a.ts", "/workspace/a.ts"]);
    vi.useRealTimers();
  });

  it("extractFindingsFromDiagnostics handles missing data field", async () => {
    const { extractFindingsFromDiagnostics } = await import("../../src/features/tree-view.js");
    const diag = {
      source: "sentinel/security",
      severity: 0,
      message: "test",
      range: { start: { line: 0 }, end: { line: 0 } },
      // no data field
    };
    const findings = extractFindingsFromDiagnostics([diag as any]);
    expect(findings).toHaveLength(0);
  });

  it("buildDashboardUrl handles URLs without port", async () => {
    const { buildDashboardUrl } = await import("../../src/commands/open-dashboard.js");
    expect(buildDashboardUrl("https://sentinel.example.com")).toBe("https://sentinel.example.com");
    expect(buildDashboardUrl("http://localhost:9090")).toBe("http://localhost:3000");
  });

  it("configure stores empty token when user explicitly enters empty string", async () => {
    const { handleConfigure } = await import("../../src/commands/configure.js");
    const secrets = { store: vi.fn(), get: vi.fn() };
    const showInputBox = vi.fn().mockResolvedValue("");
    await handleConfigure(secrets as any, showInputBox as any);
    // Empty string IS stored (user explicitly entered it) - only undefined (cancel) skips
    expect(secrets.store).toHaveBeenCalledWith("sentinel.apiToken", "");
  });

  it("status bar updates to connected with no findings", async () => {
    const { createStatusBar, updateStatusBar } = await import("../../src/features/status-bar.js");
    const item = createStatusBar();
    updateStatusBar(item, "connected", 0, 0);
    expect(item.text).toBe("$(shield) Sentinel");
    expect(item.backgroundColor).toBeUndefined();
  });

  it("detail HTML renders history entries when provided", async () => {
    const { renderDetailHtml } = await import("../../src/features/detail-html.js");
    const finding = {
      id: "f1", scanId: "s1", orgId: "o1", agentName: "security",
      type: "vulnerability", severity: "high", category: "sqli",
      file: "src/db.ts", lineStart: 10, lineEnd: 10,
      title: "SQL Injection", description: null, remediation: null,
      cweId: null, confidence: 0.8, suppressed: false,
      createdAt: "2026-01-01T00:00:00Z",
    };
    const html = renderDetailHtml(finding, {
      history: [
        { status: "detected", timestamp: "2026-01-01T00:00:00Z" },
        { status: "acknowledged", timestamp: "2026-01-02T00:00:00Z" },
      ],
    });
    expect(html).toContain("History");
    expect(html).toContain("detected");
    expect(html).toContain("acknowledged");
  });

  it("detail HTML shows Unsuppress button for suppressed findings", async () => {
    const { renderDetailHtml } = await import("../../src/features/detail-html.js");
    const finding = {
      id: "f1", scanId: "s1", orgId: "o1", agentName: "security",
      type: "vulnerability", severity: "low", category: null,
      file: "src/a.ts", lineStart: 1, lineEnd: 1,
      title: "Minor issue", description: null, remediation: null,
      cweId: null, confidence: 0.5, suppressed: true,
      createdAt: "2026-01-01T00:00:00Z",
    };
    const html = renderDetailHtml(finding, {});
    expect(html).toContain("Unsuppress");
  });

  it("TreeView totalCount respects severity threshold", async () => {
    const { FindingsTreeProvider } = await import("../../src/features/tree-view.js");
    const provider = new FindingsTreeProvider();
    const makeFinding = (id: string, sev: string) => ({
      id, scanId: "s1", orgId: "o1", agentName: "security", type: "vulnerability",
      severity: sev, category: null, file: "a.ts", lineStart: 1, lineEnd: 1,
      title: `Finding ${id}`, description: null, remediation: null, cweId: null,
      confidence: 0.9, suppressed: false, createdAt: "2026-01-01",
    });

    provider.updateFindings([
      makeFinding("1", "critical"),
      makeFinding("2", "high"),
      makeFinding("3", "low"),
      makeFinding("4", "info"),
    ]);
    expect(provider.totalCount).toBe(4);
    provider.setSeverityThreshold("high");
    expect(provider.totalCount).toBe(2);
  });
});
