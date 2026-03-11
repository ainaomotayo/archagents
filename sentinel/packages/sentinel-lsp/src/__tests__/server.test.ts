import { describe, it, expect, vi } from "vitest";
import { createSentinelLspServer, type ServerDeps } from "../server.js";
import type { SentinelFinding, SentinelEvent } from "../types.js";
import { TextDocumentSyncKind } from "vscode-languageserver";

function makeFinding(overrides: Partial<SentinelFinding> = {}): SentinelFinding {
  return {
    id: "f-1",
    scanId: "s-1",
    orgId: "org-1",
    agentName: "security",
    type: "vulnerability",
    severity: "high",
    category: "sql-injection",
    file: "src/index.ts",
    lineStart: 10,
    lineEnd: 10,
    title: "SQL Injection detected",
    description: "User input used directly in SQL query",
    remediation: "Use parameterized queries",
    cweId: "CWE-89",
    confidence: 0.95,
    suppressed: false,
    createdAt: "2026-03-10T00:00:00Z",
    ...overrides,
  };
}

function createMockDeps(): ServerDeps {
  return {
    apiClient: {
      getFindings: vi.fn().mockResolvedValue({ findings: [makeFinding()], total: 1 }),
      suppressFinding: vi.fn().mockResolvedValue({}),
      unsuppressFinding: vi.fn().mockResolvedValue({}),
      triggerScan: vi.fn().mockResolvedValue({}),
      getProjects: vi.fn().mockResolvedValue([]),
    } as any,
    sseListener: {
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as any,
    findingCache: {
      upsert: vi.fn(),
      getForFile: vi.fn().mockReturnValue([makeFinding()]),
      getAll: vi.fn().mockReturnValue([makeFinding()]),
      remove: vi.fn(),
      clear: vi.fn(),
      save: vi.fn(),
      load: vi.fn(),
    } as any,
  };
}

describe("createSentinelLspServer", () => {
  it("initialize returns correct capabilities", () => {
    const deps = createMockDeps();
    const server = createSentinelLspServer(deps);

    const result = server.onInitialize({
      capabilities: {},
      processId: 1,
      rootUri: "file:///workspace/project",
      workspaceFolders: null,
    });

    expect(result.capabilities.textDocumentSync).toBe(TextDocumentSyncKind.Incremental);
    expect(result.capabilities.diagnosticProvider).toEqual({
      interFileDependencies: false,
      workspaceDiagnostics: false,
    });
    expect(result.capabilities.codeActionProvider).toBe(true);
    expect(result.capabilities.codeLensProvider).toBeDefined();
    expect(result.capabilities.executeCommandProvider).toBeDefined();
    expect(result.capabilities.executeCommandProvider!.commands).toContain("sentinel.suppress");
    expect(result.capabilities.executeCommandProvider!.commands).toContain("sentinel.openDashboard");
    expect(result.capabilities.executeCommandProvider!.commands).toContain("sentinel.triggerScan");
    expect(result.capabilities.executeCommandProvider!.commands).toContain("sentinel.showFindings");
  });

  it("getDiagnosticsForFile maps cached findings", () => {
    const deps = createMockDeps();
    const server = createSentinelLspServer(deps);
    server.setWorkspaceRoot("/workspace/project");

    const diagnostics = server.getDiagnosticsForFile("file:///workspace/project/src/index.ts");

    expect(deps.findingCache.getForFile).toHaveBeenCalled();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].source).toMatch(/sentinel/);
  });

  it("getCodeActionsForFile returns suppress and view actions", () => {
    const deps = createMockDeps();
    const server = createSentinelLspServer(deps);
    server.setWorkspaceRoot("/workspace/project");

    const range = {
      start: { line: 9, character: 0 },
      end: { line: 9, character: 0 },
    };

    const actions = server.getCodeActionsForFile(
      "file:///workspace/project/src/index.ts",
      range,
    );

    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some((a) => a.title.includes("Suppress"))).toBe(true);
  });

  it("getCodeLensesForFile returns grouped lenses", () => {
    const deps = createMockDeps();
    const server = createSentinelLspServer(deps);
    server.setWorkspaceRoot("/workspace/project");

    const lenses = server.getCodeLensesForFile("file:///workspace/project/src/index.ts");

    expect(lenses.length).toBeGreaterThan(0);
    expect(lenses[0].command!.title).toMatch(/Sentinel/);
  });

  it("handleCommand sentinel.suppress calls API and removes from cache", async () => {
    const deps = createMockDeps();
    const server = createSentinelLspServer(deps);

    await server.handleCommand("sentinel.suppress", ["f-1"]);

    expect(deps.apiClient.suppressFinding).toHaveBeenCalledWith("f-1");
    expect(deps.findingCache.remove).toHaveBeenCalledWith(["f-1"]);
  });

  it("handleCommand sentinel.triggerScan calls API", async () => {
    const deps = createMockDeps();
    const server = createSentinelLspServer(deps);

    await server.handleCommand("sentinel.triggerScan", ["proj-1", ["src/app.ts"]]);

    expect(deps.apiClient.triggerScan).toHaveBeenCalledWith("proj-1", ["src/app.ts"]);
  });

  it("handleCommand sentinel.showFindings returns finding IDs", async () => {
    const deps = createMockDeps();
    const server = createSentinelLspServer(deps);

    const result = await server.handleCommand("sentinel.showFindings", [["f-1", "f-2"]]);

    expect(result).toEqual(["f-1", "f-2"]);
  });

  it("handleSseEvent upserts findings", async () => {
    const deps = createMockDeps();
    const server = createSentinelLspServer(deps);

    const event: SentinelEvent = {
      id: "e-1",
      orgId: "org-1",
      topic: "scan.completed",
      payload: { scanId: "s-1" },
      timestamp: "2026-03-10T00:00:00Z",
    };

    await server.handleSseEvent(event);

    expect(deps.apiClient.getFindings).toHaveBeenCalled();
    expect(deps.findingCache.upsert).toHaveBeenCalled();
  });
});
