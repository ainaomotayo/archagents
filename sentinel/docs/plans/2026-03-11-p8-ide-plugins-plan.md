# P8: IDE Plugins (VS Code / JetBrains / Vim) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an LSP server that connects to Sentinel's API, caches findings locally, and pushes inline diagnostics + code actions to any IDE via the Language Server Protocol — with thin VS Code and JetBrains clients.

**Architecture:** `sentinel-lsp` (Node.js) runs as a sidecar process, maintains an SSE connection for real-time events, caches findings in JSON, maps them to LSP diagnostics/code-actions/code-lenses. VS Code extension launches LSP via IPC. JetBrains plugin launches via stdio. Both are <200 LOC each.

**Tech Stack:** TypeScript, `vscode-languageserver` (LSP framework), `vscode-languageclient` (VS Code client), `eventsource` (SSE), vitest. JetBrains: Kotlin + LSP4IJ.

---

## Task 1: Scaffold `@sentinel/sentinel-lsp` Package

**Files:**
- Create: `packages/sentinel-lsp/package.json`
- Create: `packages/sentinel-lsp/tsconfig.json`
- Create: `packages/sentinel-lsp/src/index.ts`
- Create: `packages/sentinel-lsp/src/types.ts`

**Step 1: Create `packages/sentinel-lsp/package.json`**

```json
{
  "name": "@sentinel/sentinel-lsp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "sentinel-lsp": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "echo 'lint placeholder'"
  },
  "dependencies": {
    "@sentinel/auth": "workspace:*",
    "vscode-languageserver": "^10.0.0",
    "vscode-languageserver-textdocument": "^1.0.0",
    "eventsource": "^3.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/eventsource": "^3.0.0",
    "typescript": "^5.7",
    "vitest": "^3.0"
  }
}
```

**Step 2: Create `packages/sentinel-lsp/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/**/__tests__/**"]
}
```

**Step 3: Create `packages/sentinel-lsp/src/types.ts`**

```typescript
export interface SentinelFinding {
  id: string;
  scanId: string;
  orgId: string;
  agentName: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string | null;
  file: string;
  lineStart: number;
  lineEnd: number;
  title: string | null;
  description: string | null;
  remediation: string | null;
  cweId: string | null;
  confidence: number;
  suppressed: boolean;
  createdAt: string;
}

export interface SentinelProject {
  id: string;
  name: string;
  repoUrl: string | null;
}

export interface SentinelEvent {
  id: string;
  orgId: string;
  topic: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface LspServerConfig {
  apiUrl: string;
  apiToken: string;
  orgId: string;
  projectId?: string;
  topics?: string[];
}
```

**Step 4: Create `packages/sentinel-lsp/src/index.ts`**

```typescript
export { type SentinelFinding, type SentinelProject, type SentinelEvent, type LspServerConfig } from "./types.js";
```

**Step 5: Install dependencies and verify build**

Run: `cd sentinel && pnpm install && npx turbo build --filter=@sentinel/sentinel-lsp`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add packages/sentinel-lsp/
git commit -m "feat(sentinel-lsp): scaffold LSP server package with types"
```

---

## Task 2: Finding Cache with Path Matching

**Files:**
- Create: `packages/sentinel-lsp/src/finding-cache.ts`
- Create: `packages/sentinel-lsp/src/__tests__/finding-cache.test.ts`
- Modify: `packages/sentinel-lsp/src/index.ts`

**Step 1: Write the failing tests**

Create `packages/sentinel-lsp/src/__tests__/finding-cache.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { FindingCache } from "../finding-cache.js";
import type { SentinelFinding } from "../types.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

function makeFinding(overrides: Partial<SentinelFinding> = {}): SentinelFinding {
  return {
    id: "f-1",
    scanId: "s-1",
    orgId: "org-1",
    agentName: "security",
    type: "security",
    severity: "high",
    category: "sql-injection",
    file: "src/users/controller.ts",
    lineStart: 42,
    lineEnd: 42,
    title: "Potential SQL injection",
    description: "User input not sanitized",
    remediation: "Use parameterized queries",
    cweId: "CWE-89",
    confidence: 0.95,
    suppressed: false,
    createdAt: "2026-03-11T10:00:00Z",
    ...overrides,
  };
}

describe("FindingCache", () => {
  let cache: FindingCache;

  beforeEach(() => {
    cache = new FindingCache();
  });

  test("upsert and getForFile returns findings by exact relative path", () => {
    cache.upsert([makeFinding()]);
    const results = cache.getForFile("/workspace/src/users/controller.ts", "/workspace");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("f-1");
  });

  test("getForFile returns empty for unknown file", () => {
    cache.upsert([makeFinding()]);
    const results = cache.getForFile("/workspace/src/other.ts", "/workspace");
    expect(results).toHaveLength(0);
  });

  test("suffix fallback matches monorepo sub-paths", () => {
    cache.upsert([makeFinding({ file: "users/controller.ts" })]);
    const results = cache.getForFile("/workspace/packages/api/users/controller.ts", "/workspace");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("f-1");
  });

  test("remove deletes findings and updates index", () => {
    cache.upsert([makeFinding(), makeFinding({ id: "f-2", file: "src/other.ts" })]);
    expect(cache.getAll()).toHaveLength(2);
    cache.remove(["f-1"]);
    expect(cache.getAll()).toHaveLength(1);
    expect(cache.getForFile("/workspace/src/users/controller.ts", "/workspace")).toHaveLength(0);
  });

  test("upsert updates existing finding by id", () => {
    cache.upsert([makeFinding()]);
    cache.upsert([makeFinding({ title: "Updated title" })]);
    expect(cache.getAll()).toHaveLength(1);
    expect(cache.getAll()[0].title).toBe("Updated title");
  });

  test("excludes suppressed findings from getForFile", () => {
    cache.upsert([makeFinding({ suppressed: true })]);
    const results = cache.getForFile("/workspace/src/users/controller.ts", "/workspace");
    expect(results).toHaveLength(0);
  });

  test("clear removes all findings", () => {
    cache.upsert([makeFinding(), makeFinding({ id: "f-2", file: "src/b.ts" })]);
    cache.clear();
    expect(cache.getAll()).toHaveLength(0);
  });

  test("save and load persists to disk", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sentinel-cache-"));
    cache.upsert([makeFinding()]);
    cache.save(tmpDir, "proj-1");

    const cache2 = new FindingCache();
    cache2.load(tmpDir, "proj-1");
    expect(cache2.getAll()).toHaveLength(1);
    expect(cache2.getAll()[0].id).toBe("f-1");

    fs.rmSync(tmpDir, { recursive: true });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd sentinel && npx vitest run packages/sentinel-lsp/src/__tests__/finding-cache.test.ts`
Expected: FAIL — `finding-cache.js` does not exist

**Step 3: Write the implementation**

Create `packages/sentinel-lsp/src/finding-cache.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";

import type { SentinelFinding } from "./types.js";

export class FindingCache {
  private findings = new Map<string, SentinelFinding>();
  private byFile = new Map<string, Set<string>>();
  private bySuffix = new Map<string, Set<string>>();

  upsert(findings: SentinelFinding[]): void {
    for (const f of findings) {
      const existing = this.findings.get(f.id);
      if (existing) {
        this.removeFromIndex(existing);
      }
      this.findings.set(f.id, f);
      this.addToIndex(f);
    }
  }

  remove(findingIds: string[]): void {
    for (const id of findingIds) {
      const f = this.findings.get(id);
      if (f) {
        this.removeFromIndex(f);
        this.findings.delete(id);
      }
    }
  }

  getForFile(absolutePath: string, workspaceRoot: string): SentinelFinding[] {
    const relative = path.relative(workspaceRoot, absolutePath).split(path.sep).join("/");

    // 1. Exact relative path match
    const ids = this.byFile.get(relative);
    if (ids?.size) {
      return this.resolveIds(ids);
    }

    // 2. Suffix fallback for monorepo sub-paths
    const filename = path.basename(absolutePath);
    const candidates = this.bySuffix.get(filename);
    if (!candidates) return [];

    const normalizedAbsolute = absolutePath.split(path.sep).join("/");
    for (const candidatePath of candidates) {
      if (normalizedAbsolute.endsWith(candidatePath)) {
        const candidateIds = this.byFile.get(candidatePath);
        if (candidateIds?.size) {
          return this.resolveIds(candidateIds);
        }
      }
    }

    return [];
  }

  getAll(): SentinelFinding[] {
    return [...this.findings.values()];
  }

  clear(): void {
    this.findings.clear();
    this.byFile.clear();
    this.bySuffix.clear();
  }

  save(cacheDir: string, projectId: string): void {
    const dir = path.join(cacheDir, projectId);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, "findings.json");
    const tmpPath = filePath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify([...this.findings.values()], null, 2));
    fs.renameSync(tmpPath, filePath);
  }

  load(cacheDir: string, projectId: string): void {
    const filePath = path.join(cacheDir, projectId, "findings.json");
    if (!fs.existsSync(filePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as SentinelFinding[];
      this.upsert(data);
    } catch {
      // Corrupted cache — ignore, will be refetched
    }
  }

  private resolveIds(ids: Set<string>): SentinelFinding[] {
    return [...ids]
      .map((id) => this.findings.get(id))
      .filter((f): f is SentinelFinding => f != null && !f.suppressed);
  }

  private addToIndex(f: SentinelFinding): void {
    const normalizedFile = f.file.split(path.sep).join("/");
    if (!this.byFile.has(normalizedFile)) {
      this.byFile.set(normalizedFile, new Set());
    }
    this.byFile.get(normalizedFile)!.add(f.id);

    const filename = path.posix.basename(normalizedFile);
    if (!this.bySuffix.has(filename)) {
      this.bySuffix.set(filename, new Set());
    }
    this.bySuffix.get(filename)!.add(normalizedFile);
  }

  private removeFromIndex(f: SentinelFinding): void {
    const normalizedFile = f.file.split(path.sep).join("/");
    this.byFile.get(normalizedFile)?.delete(f.id);
    if (this.byFile.get(normalizedFile)?.size === 0) {
      this.byFile.delete(normalizedFile);
      const filename = path.posix.basename(normalizedFile);
      this.bySuffix.get(filename)?.delete(normalizedFile);
      if (this.bySuffix.get(filename)?.size === 0) {
        this.bySuffix.delete(filename);
      }
    }
  }
}
```

**Step 4: Export from index**

Add to `packages/sentinel-lsp/src/index.ts`:

```typescript
export { FindingCache } from "./finding-cache.js";
```

**Step 5: Run tests to verify they pass**

Run: `cd sentinel && npx vitest run packages/sentinel-lsp/src/__tests__/finding-cache.test.ts`
Expected: 8 tests PASS

**Step 6: Commit**

```bash
git add packages/sentinel-lsp/src/finding-cache.ts packages/sentinel-lsp/src/__tests__/finding-cache.test.ts packages/sentinel-lsp/src/index.ts
git commit -m "feat(sentinel-lsp): add FindingCache with HashMap + suffix fallback"
```

---

## Task 3: Diagnostic Mapper (Finding -> LSP Diagnostic + CodeAction + CodeLens)

**Files:**
- Create: `packages/sentinel-lsp/src/diagnostic-mapper.ts`
- Create: `packages/sentinel-lsp/src/__tests__/diagnostic-mapper.test.ts`
- Modify: `packages/sentinel-lsp/src/index.ts`

**Step 1: Write the failing tests**

Create `packages/sentinel-lsp/src/__tests__/diagnostic-mapper.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { DiagnosticMapper } from "../diagnostic-mapper.js";
import { DiagnosticSeverity, CodeActionKind } from "vscode-languageserver";
import type { SentinelFinding } from "../types.js";

function makeFinding(overrides: Partial<SentinelFinding> = {}): SentinelFinding {
  return {
    id: "f-1", scanId: "s-1", orgId: "org-1", agentName: "security", type: "security",
    severity: "high", category: "sql-injection", file: "src/controller.ts",
    lineStart: 42, lineEnd: 42, title: "SQL injection", description: "Unsanitized input",
    remediation: "Use parameterized queries", cweId: "CWE-89", confidence: 0.95,
    suppressed: false, createdAt: "2026-03-11T10:00:00Z", ...overrides,
  };
}

describe("DiagnosticMapper", () => {
  const mapper = new DiagnosticMapper();

  test("maps critical severity to Error", () => {
    const diag = mapper.toDiagnostic(makeFinding({ severity: "critical" }));
    expect(diag.severity).toBe(DiagnosticSeverity.Error);
  });

  test("maps medium severity to Warning", () => {
    const diag = mapper.toDiagnostic(makeFinding({ severity: "medium" }));
    expect(diag.severity).toBe(DiagnosticSeverity.Warning);
  });

  test("maps info severity to Hint", () => {
    const diag = mapper.toDiagnostic(makeFinding({ severity: "info" }));
    expect(diag.severity).toBe(DiagnosticSeverity.Hint);
  });

  test("sets source to sentinel/{agentName}", () => {
    const diag = mapper.toDiagnostic(makeFinding({ agentName: "dependency" }));
    expect(diag.source).toBe("sentinel/dependency");
  });

  test("uses CWE ID as code when present", () => {
    const diag = mapper.toDiagnostic(makeFinding({ cweId: "CWE-89" }));
    expect(diag.code).toBe("CWE-89");
  });

  test("falls back to category when no CWE", () => {
    const diag = mapper.toDiagnostic(makeFinding({ cweId: null, category: "xss" }));
    expect(diag.code).toBe("xss");
  });

  test("sets correct line range (0-indexed)", () => {
    const diag = mapper.toDiagnostic(makeFinding({ lineStart: 10, lineEnd: 15 }));
    expect(diag.range.start.line).toBe(9);
    expect(diag.range.end.line).toBe(14);
  });

  test("toCodeActions returns suppress and view actions", () => {
    const actions = mapper.toCodeActions(makeFinding());
    expect(actions).toHaveLength(2);
    expect(actions[0].title).toContain("Suppress");
    expect(actions[0].kind).toBe(CodeActionKind.QuickFix);
    expect(actions[1].title).toContain("View in Dashboard");
  });

  test("toCodeLens groups findings by first line", () => {
    const findings = [
      makeFinding({ id: "f-1", lineStart: 10, lineEnd: 12 }),
      makeFinding({ id: "f-2", lineStart: 10, lineEnd: 11, severity: "critical" }),
      makeFinding({ id: "f-3", lineStart: 50, lineEnd: 52 }),
    ];
    const lenses = mapper.toCodeLenses(findings);
    expect(lenses).toHaveLength(2);
    expect(lenses[0].command!.title).toContain("2");
    expect(lenses[0].command!.title).toContain("critical");
    expect(lenses[1].command!.title).toContain("1");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd sentinel && npx vitest run packages/sentinel-lsp/src/__tests__/diagnostic-mapper.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `packages/sentinel-lsp/src/diagnostic-mapper.ts`:

```typescript
import {
  Diagnostic,
  DiagnosticSeverity,
  CodeAction,
  CodeActionKind,
  CodeLens,
  Command,
} from "vscode-languageserver";
import type { SentinelFinding } from "./types.js";

const SEVERITY_MAP: Record<string, DiagnosticSeverity> = {
  critical: DiagnosticSeverity.Error,
  high: DiagnosticSeverity.Error,
  medium: DiagnosticSeverity.Warning,
  low: DiagnosticSeverity.Information,
  info: DiagnosticSeverity.Hint,
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export class DiagnosticMapper {
  toDiagnostic(finding: SentinelFinding): Diagnostic {
    return {
      range: {
        start: { line: finding.lineStart - 1, character: 0 },
        end: { line: finding.lineEnd - 1, character: Number.MAX_SAFE_INTEGER },
      },
      severity: SEVERITY_MAP[finding.severity] ?? DiagnosticSeverity.Information,
      code: finding.cweId ?? finding.category ?? undefined,
      source: `sentinel/${finding.agentName}`,
      message: finding.title ?? finding.description ?? finding.category ?? "Sentinel finding",
      data: { findingId: finding.id },
    };
  }

  toCodeActions(finding: SentinelFinding): CodeAction[] {
    const diagnostic = this.toDiagnostic(finding);
    return [
      {
        title: `Suppress: ${finding.title ?? finding.category ?? "finding"}`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        command: Command.create(
          "Suppress finding",
          "sentinel.suppress",
          finding.id,
        ),
      },
      {
        title: "View in Sentinel Dashboard",
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        command: Command.create(
          "Open Dashboard",
          "sentinel.openDashboard",
          finding.id,
        ),
      },
    ];
  }

  toCodeLenses(findings: SentinelFinding[]): CodeLens[] {
    const groups = new Map<number, SentinelFinding[]>();
    for (const f of findings) {
      const line = f.lineStart;
      if (!groups.has(line)) groups.set(line, []);
      groups.get(line)!.push(f);
    }

    return [...groups.entries()].map(([line, group]) => {
      const maxSeverity = group.reduce((max, f) =>
        (SEVERITY_ORDER[f.severity] ?? 4) < (SEVERITY_ORDER[max.severity] ?? 4) ? f : max,
      ).severity;
      return {
        range: {
          start: { line: line - 1, character: 0 },
          end: { line: line - 1, character: 0 },
        },
        command: Command.create(
          `$(warning) ${group.length} Sentinel finding${group.length > 1 ? "s" : ""} (${maxSeverity})`,
          "sentinel.showFindings",
          group.map((f) => f.id),
        ),
      };
    });
  }
}
```

**Step 4: Export from index**

Add to `packages/sentinel-lsp/src/index.ts`:

```typescript
export { DiagnosticMapper } from "./diagnostic-mapper.js";
```

**Step 5: Run tests**

Run: `cd sentinel && npx vitest run packages/sentinel-lsp/src/__tests__/diagnostic-mapper.test.ts`
Expected: 10 tests PASS

**Step 6: Commit**

```bash
git add packages/sentinel-lsp/src/diagnostic-mapper.ts packages/sentinel-lsp/src/__tests__/diagnostic-mapper.test.ts packages/sentinel-lsp/src/index.ts
git commit -m "feat(sentinel-lsp): add DiagnosticMapper for Finding -> LSP Diagnostic/CodeAction/CodeLens"
```

---

## Task 4: API Client with HMAC-SHA256 Signing

**Files:**
- Create: `packages/sentinel-lsp/src/api-client.ts`
- Create: `packages/sentinel-lsp/src/__tests__/api-client.test.ts`
- Modify: `packages/sentinel-lsp/src/index.ts`

**Step 1: Write the failing tests**

Create `packages/sentinel-lsp/src/__tests__/api-client.test.ts`:

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";
import { SentinelApiClient } from "../api-client.js";

describe("SentinelApiClient", () => {
  let client: SentinelApiClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new SentinelApiClient("http://localhost:8080", "test-token", "org-1", mockFetch);
  });

  test("getFindings sends signed GET request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ findings: [{ id: "f-1" }], total: 1 }),
    });
    const result = await client.getFindings();
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/v1/findings");
    expect(opts.headers["X-Sentinel-Signature"]).toMatch(/^t=\d+,sig=[a-f0-9]{64}$/);
    expect(opts.headers["X-Sentinel-Org-Id"]).toBe("org-1");
    expect(result.findings).toHaveLength(1);
  });

  test("suppressFinding sends PATCH with suppressed=true", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await client.suppressFinding("f-1");
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/v1/findings/f-1");
    expect(opts.method).toBe("PATCH");
    expect(JSON.parse(opts.body)).toEqual({ suppressed: true });
  });

  test("triggerScan sends POST to /v1/scans", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ scanId: "s-1", status: "pending" }),
    });
    const result = await client.triggerScan("proj-1", []);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/v1/scans");
    expect(opts.method).toBe("POST");
    expect(result.scanId).toBe("s-1");
  });

  test("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });
    await expect(client.getFindings()).rejects.toThrow("401");
  });

  test("HMAC signature uses correct format", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ findings: [], total: 0 }) });
    await client.getFindings();
    const sig = mockFetch.mock.calls[0][1].headers["X-Sentinel-Signature"];
    expect(sig).toMatch(/^t=\d+,sig=[a-f0-9]{64}$/);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd sentinel && npx vitest run packages/sentinel-lsp/src/__tests__/api-client.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `packages/sentinel-lsp/src/api-client.ts`:

```typescript
import { createHmac } from "node:crypto";
import type { SentinelFinding, SentinelProject } from "./types.js";

type FetchFn = typeof globalThis.fetch;

function signRequest(body: string, secret: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const mac = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  return `t=${ts},sig=${mac}`;
}

export class SentinelApiClient {
  constructor(
    private baseUrl: string,
    private apiToken: string,
    private orgId: string,
    private fetchFn: FetchFn = globalThis.fetch,
  ) {}

  async getFindings(opts?: { severity?: string; projectId?: string }): Promise<{ findings: SentinelFinding[]; total: number }> {
    const params = new URLSearchParams();
    if (opts?.severity) params.set("severity", opts.severity);
    if (opts?.projectId) params.set("projectId", opts.projectId);
    const qs = params.toString();
    return this.request("GET", `/v1/findings${qs ? `?${qs}` : ""}`);
  }

  async suppressFinding(findingId: string): Promise<void> {
    await this.request("PATCH", `/v1/findings/${findingId}`, { suppressed: true });
  }

  async unsuppressFinding(findingId: string): Promise<void> {
    await this.request("PATCH", `/v1/findings/${findingId}`, { suppressed: false });
  }

  async triggerScan(projectId: string, files: string[]): Promise<{ scanId: string; status: string }> {
    return this.request("POST", "/v1/scans", {
      projectId,
      commitHash: `ide-${Date.now()}`,
      branch: "HEAD",
      author: "sentinel-ide",
      timestamp: new Date().toISOString(),
      files,
    });
  }

  async getProjects(): Promise<SentinelProject[]> {
    const result = await this.request("GET", "/v1/projects");
    return (result as any).projects ?? result;
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const bodyStr = body ? JSON.stringify(body) : "";
    const signature = signRequest(bodyStr, this.apiToken);

    const headers: Record<string, string> = {
      "X-Sentinel-Signature": signature,
      "X-Sentinel-Org-Id": this.orgId,
      "Content-Type": "application/json",
    };

    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? bodyStr : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Sentinel API ${method} ${path} failed: ${response.status} ${text}`);
    }

    return response.json();
  }
}
```

**Step 4: Export from index**

Add to `packages/sentinel-lsp/src/index.ts`:

```typescript
export { SentinelApiClient } from "./api-client.js";
```

**Step 5: Run tests**

Run: `cd sentinel && npx vitest run packages/sentinel-lsp/src/__tests__/api-client.test.ts`
Expected: 5 tests PASS

**Step 6: Commit**

```bash
git add packages/sentinel-lsp/src/api-client.ts packages/sentinel-lsp/src/__tests__/api-client.test.ts packages/sentinel-lsp/src/index.ts
git commit -m "feat(sentinel-lsp): add SentinelApiClient with HMAC-SHA256 signing"
```

---

## Task 5: SSE Listener with Reconnection

**Files:**
- Create: `packages/sentinel-lsp/src/sse-listener.ts`
- Create: `packages/sentinel-lsp/src/__tests__/sse-listener.test.ts`
- Modify: `packages/sentinel-lsp/src/index.ts`

**Step 1: Write the failing tests**

Create `packages/sentinel-lsp/src/__tests__/sse-listener.test.ts`:

```typescript
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { SseListener } from "../sse-listener.js";

describe("SseListener", () => {
  let listener: SseListener;
  let mockEvents: any[];
  let mockEventSource: any;

  beforeEach(() => {
    mockEvents = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    listener?.disconnect();
  });

  function createMockEventSourceClass() {
    return class MockEventSource {
      onmessage: ((event: any) => void) | null = null;
      onerror: (() => void) | null = null;
      onopen: (() => void) | null = null;
      readyState = 1;
      url: string;
      closed = false;
      constructor(url: string) {
        this.url = url;
        mockEventSource = this;
      }
      close() { this.closed = true; this.readyState = 2; }
    };
  }

  test("connects with correct URL including topics", () => {
    const ESClass = createMockEventSourceClass();
    listener = new SseListener("http://localhost:8080", "token", "org-1", ["scan.*"], vi.fn(), ESClass as any);
    listener.connect();
    expect(mockEventSource.url).toContain("/v1/events/stream");
    expect(mockEventSource.url).toContain("topics=scan.*");
  });

  test("parses events and calls onEvent", () => {
    const onEvent = vi.fn();
    const ESClass = createMockEventSourceClass();
    listener = new SseListener("http://localhost:8080", "token", "org-1", ["scan.*"], onEvent, ESClass as any);
    listener.connect();
    mockEventSource.onmessage?.({
      data: JSON.stringify({ id: "e-1", topic: "scan.completed", orgId: "org-1", payload: {}, timestamp: "2026-03-11T00:00:00Z" }),
    });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "e-1", topic: "scan.completed" }));
  });

  test("reconnects with exponential backoff on error", () => {
    const ESClass = createMockEventSourceClass();
    listener = new SseListener("http://localhost:8080", "token", "org-1", ["scan.*"], vi.fn(), ESClass as any);
    listener.connect();
    const first = mockEventSource;
    first.onerror?.();
    vi.advanceTimersByTime(1000);
    expect(mockEventSource).not.toBe(first);
  });

  test("caps reconnect delay at 30 seconds", () => {
    const ESClass = createMockEventSourceClass();
    listener = new SseListener("http://localhost:8080", "token", "org-1", ["scan.*"], vi.fn(), ESClass as any);
    listener.connect();
    // Trigger many errors
    for (let i = 0; i < 20; i++) {
      mockEventSource.onerror?.();
      vi.advanceTimersByTime(60_000);
    }
    expect(listener.getReconnectDelay()).toBeLessThanOrEqual(30_000);
  });

  test("disconnect closes event source", () => {
    const ESClass = createMockEventSourceClass();
    listener = new SseListener("http://localhost:8080", "token", "org-1", ["scan.*"], vi.fn(), ESClass as any);
    listener.connect();
    listener.disconnect();
    expect(mockEventSource.closed).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd sentinel && npx vitest run packages/sentinel-lsp/src/__tests__/sse-listener.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

Create `packages/sentinel-lsp/src/sse-listener.ts`:

```typescript
import type { SentinelEvent } from "./types.js";

type EventSourceConstructor = new (url: string) => EventSource;

export class SseListener {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private maxReconnectDelay = 30_000;

  constructor(
    private baseUrl: string,
    private apiToken: string,
    private orgId: string,
    private topics: string[],
    private onEvent: (event: SentinelEvent) => void,
    private EventSourceClass?: EventSourceConstructor,
  ) {}

  connect(): void {
    this.disconnect();

    const topicsParam = encodeURIComponent(this.topics.join(","));
    const url = `${this.baseUrl}/v1/events/stream?topics=${topicsParam}&orgId=${this.orgId}`;

    const ES = this.EventSourceClass ?? globalThis.EventSource;
    this.eventSource = new ES(url);

    this.eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as SentinelEvent;
        this.onEvent(data);
        this.reconnectAttempts = 0;
      } catch {
        // Skip malformed events
      }
    };

    this.eventSource.onerror = () => {
      this.scheduleReconnect();
    };

    this.eventSource.onopen = () => {
      this.reconnectAttempts = 0;
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  getReconnectDelay(): number {
    return Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
  }

  private scheduleReconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    const delay = this.getReconnectDelay();
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
```

**Step 4: Export from index**

Add to `packages/sentinel-lsp/src/index.ts`:

```typescript
export { SseListener } from "./sse-listener.js";
```

**Step 5: Run tests**

Run: `cd sentinel && npx vitest run packages/sentinel-lsp/src/__tests__/sse-listener.test.ts`
Expected: 5 tests PASS

**Step 6: Commit**

```bash
git add packages/sentinel-lsp/src/sse-listener.ts packages/sentinel-lsp/src/__tests__/sse-listener.test.ts packages/sentinel-lsp/src/index.ts
git commit -m "feat(sentinel-lsp): add SseListener with exponential backoff reconnection"
```

---

## Task 6: LSP Server Core (Initialize, Diagnostics, CodeActions, CodeLens)

**Files:**
- Create: `packages/sentinel-lsp/src/server.ts`
- Create: `packages/sentinel-lsp/src/__tests__/server.test.ts`

**Step 1: Write the failing tests**

Create `packages/sentinel-lsp/src/__tests__/server.test.ts`:

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";
import { createSentinelLspServer, type ServerDeps } from "../server.js";
import type { SentinelFinding } from "../types.js";

function makeFinding(overrides: Partial<SentinelFinding> = {}): SentinelFinding {
  return {
    id: "f-1", scanId: "s-1", orgId: "org-1", agentName: "security", type: "security",
    severity: "high", category: "sql-injection", file: "src/controller.ts",
    lineStart: 42, lineEnd: 42, title: "SQL injection", description: "Unsanitized input",
    remediation: "Use parameterized queries", cweId: "CWE-89", confidence: 0.95,
    suppressed: false, createdAt: "2026-03-11T10:00:00Z", ...overrides,
  };
}

function createMockDeps(): ServerDeps {
  return {
    apiClient: {
      getFindings: vi.fn().mockResolvedValue({ findings: [makeFinding()], total: 1 }),
      suppressFinding: vi.fn().mockResolvedValue(undefined),
      unsuppressFinding: vi.fn().mockResolvedValue(undefined),
      triggerScan: vi.fn().mockResolvedValue({ scanId: "s-1", status: "pending" }),
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

describe("SentinelLspServer", () => {
  test("initialize returns correct capabilities", () => {
    const deps = createMockDeps();
    const server = createSentinelLspServer(deps);
    const result = server.onInitialize({
      capabilities: {},
      rootUri: "file:///workspace",
      processId: null,
    } as any);
    expect(result.capabilities.diagnosticProvider).toBeDefined();
    expect(result.capabilities.codeActionProvider).toBe(true);
    expect(result.capabilities.codeLensProvider).toBeDefined();
    expect(result.capabilities.executeCommandProvider).toBeDefined();
  });

  test("getDiagnosticsForFile maps cached findings", () => {
    const deps = createMockDeps();
    const server = createSentinelLspServer(deps);
    server.setWorkspaceRoot("/workspace");
    const diagnostics = server.getDiagnosticsForFile("file:///workspace/src/controller.ts");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].source).toBe("sentinel/security");
  });

  test("getCodeActionsForFile returns suppress and view actions", () => {
    const deps = createMockDeps();
    const server = createSentinelLspServer(deps);
    server.setWorkspaceRoot("/workspace");
    const actions = server.getCodeActionsForFile("file:///workspace/src/controller.ts", { start: { line: 41, character: 0 }, end: { line: 41, character: 100 } });
    expect(actions.length).toBeGreaterThanOrEqual(2);
    expect(actions.some(a => a.title.includes("Suppress"))).toBe(true);
  });

  test("getCodeLensesForFile returns grouped lenses", () => {
    const deps = createMockDeps();
    const server = createSentinelLspServer(deps);
    server.setWorkspaceRoot("/workspace");
    const lenses = server.getCodeLensesForFile("file:///workspace/src/controller.ts");
    expect(lenses.length).toBeGreaterThanOrEqual(1);
    expect(lenses[0].command!.title).toContain("Sentinel");
  });

  test("handleSuppressCommand calls API and removes from cache", async () => {
    const deps = createMockDeps();
    const server = createSentinelLspServer(deps);
    await server.handleCommand("sentinel.suppress", ["f-1"]);
    expect(deps.apiClient.suppressFinding).toHaveBeenCalledWith("f-1");
    expect(deps.findingCache.remove).toHaveBeenCalledWith(["f-1"]);
  });

  test("handleSseEvent upserts findings and refreshes diagnostics", async () => {
    const deps = createMockDeps();
    const server = createSentinelLspServer(deps);
    (deps.apiClient.getFindings as any).mockResolvedValueOnce({ findings: [makeFinding({ id: "f-new" })], total: 1 });
    await server.handleSseEvent({ id: "e-1", orgId: "org-1", topic: "scan.completed", payload: { scanId: "s-1" }, timestamp: "" });
    expect(deps.apiClient.getFindings).toHaveBeenCalled();
    expect(deps.findingCache.upsert).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd sentinel && npx vitest run packages/sentinel-lsp/src/__tests__/server.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

Create `packages/sentinel-lsp/src/server.ts`:

```typescript
import {
  type InitializeParams,
  type InitializeResult,
  type Diagnostic,
  type CodeAction,
  type CodeLens,
  type Range,
  TextDocumentSyncKind,
  DiagnosticOptions,
} from "vscode-languageserver";
import { URI } from "vscode-uri";

import type { SentinelApiClient } from "./api-client.js";
import type { SseListener } from "./sse-listener.js";
import type { FindingCache } from "./finding-cache.js";
import type { SentinelEvent } from "./types.js";
import { DiagnosticMapper } from "./diagnostic-mapper.js";

export interface ServerDeps {
  apiClient: SentinelApiClient;
  sseListener: SseListener;
  findingCache: FindingCache;
}

export function createSentinelLspServer(deps: ServerDeps) {
  const mapper = new DiagnosticMapper();
  let workspaceRoot = "/";
  let sendDiagnostics: ((uri: string, diagnostics: Diagnostic[]) => void) | null = null;

  function uriToPath(uri: string): string {
    try {
      return URI.parse(uri).fsPath;
    } catch {
      return uri;
    }
  }

  function getDiagnosticsForFile(uri: string): Diagnostic[] {
    const filePath = uriToPath(uri);
    const findings = deps.findingCache.getForFile(filePath, workspaceRoot);
    return findings.map((f) => mapper.toDiagnostic(f));
  }

  function getCodeActionsForFile(uri: string, range: Range): CodeAction[] {
    const filePath = uriToPath(uri);
    const findings = deps.findingCache.getForFile(filePath, workspaceRoot);
    return findings
      .filter(
        (f) =>
          f.lineStart - 1 >= range.start.line && f.lineStart - 1 <= range.end.line,
      )
      .flatMap((f) => mapper.toCodeActions(f));
  }

  function getCodeLensesForFile(uri: string): CodeLens[] {
    const filePath = uriToPath(uri);
    const findings = deps.findingCache.getForFile(filePath, workspaceRoot);
    return mapper.toCodeLenses(findings);
  }

  async function handleCommand(command: string, args: unknown[]): Promise<void> {
    if (command === "sentinel.suppress" && typeof args[0] === "string") {
      await deps.apiClient.suppressFinding(args[0]);
      deps.findingCache.remove([args[0]]);
    }
  }

  async function handleSseEvent(event: SentinelEvent): Promise<void> {
    if (event.topic === "scan.completed" || event.topic.startsWith("finding.")) {
      const result = await deps.apiClient.getFindings();
      deps.findingCache.upsert(result.findings);
    }
  }

  function setWorkspaceRoot(root: string): void {
    workspaceRoot = root;
  }

  function setSendDiagnostics(fn: (uri: string, diagnostics: Diagnostic[]) => void): void {
    sendDiagnostics = fn;
  }

  function onInitialize(params: InitializeParams): InitializeResult {
    if (params.rootUri) {
      workspaceRoot = uriToPath(params.rootUri);
    }
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        diagnosticProvider: {
          interFileDependencies: false,
          workspaceDiagnostics: false,
        } satisfies DiagnosticOptions,
        codeActionProvider: true,
        codeLensProvider: { resolveProvider: false },
        executeCommandProvider: {
          commands: ["sentinel.suppress", "sentinel.openDashboard", "sentinel.triggerScan", "sentinel.showFindings"],
        },
      },
    };
  }

  return {
    onInitialize,
    getDiagnosticsForFile,
    getCodeActionsForFile,
    getCodeLensesForFile,
    handleCommand,
    handleSseEvent,
    setWorkspaceRoot,
    setSendDiagnostics,
  };
}
```

**Step 4: Run tests**

Run: `cd sentinel && npx vitest run packages/sentinel-lsp/src/__tests__/server.test.ts`
Expected: 6 tests PASS

**Step 5: Commit**

```bash
git add packages/sentinel-lsp/src/server.ts packages/sentinel-lsp/src/__tests__/server.test.ts
git commit -m "feat(sentinel-lsp): add LSP server core with diagnostics, code actions, code lens"
```

---

## Task 7: LSP Server Entrypoint (Wire LSP Connection)

**Files:**
- Modify: `packages/sentinel-lsp/src/index.ts` — replace with entrypoint that creates connection, wires server
- Modify: `packages/sentinel-lsp/package.json` — add `vscode-uri` dependency

**Step 1: Add `vscode-uri` dependency**

Add `"vscode-uri": "^3.0.0"` to dependencies in `packages/sentinel-lsp/package.json`.

Run: `cd sentinel && pnpm install`

**Step 2: Update `packages/sentinel-lsp/src/index.ts`** to be the LSP entrypoint

```typescript
#!/usr/bin/env node
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

import { createSentinelLspServer } from "./server.js";
import { SentinelApiClient } from "./api-client.js";
import { SseListener } from "./sse-listener.js";
import { FindingCache } from "./finding-cache.js";

export { FindingCache } from "./finding-cache.js";
export { DiagnosticMapper } from "./diagnostic-mapper.js";
export { SentinelApiClient } from "./api-client.js";
export { SseListener } from "./sse-listener.js";
export { createSentinelLspServer, type ServerDeps } from "./server.js";
export type { SentinelFinding, SentinelProject, SentinelEvent, LspServerConfig } from "./types.js";

// Only start the server when running as a process (not when imported as library)
if (process.argv.includes("--stdio") || !process.env.VITEST) {
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);

  const apiUrl = process.env.SENTINEL_API_URL ?? "http://localhost:8080";
  const apiToken = process.env.SENTINEL_API_TOKEN ?? "";
  const orgId = process.env.SENTINEL_ORG_ID ?? "default";
  const cacheDir = process.env.SENTINEL_CACHE_DIR ?? `${process.env.HOME ?? "/tmp"}/.sentinel/cache`;

  const apiClient = new SentinelApiClient(apiUrl, apiToken, orgId);
  const findingCache = new FindingCache();

  const sseListener = new SseListener(
    apiUrl,
    apiToken,
    orgId,
    ["scan.*", "finding.*"],
    async (event) => {
      await server.handleSseEvent(event);
      // Re-push diagnostics for all open documents
      for (const doc of documents.all()) {
        const diagnostics = server.getDiagnosticsForFile(doc.uri);
        connection.sendDiagnostics({ uri: doc.uri, diagnostics });
      }
    },
  );

  const server = createSentinelLspServer({ apiClient, sseListener, findingCache });

  connection.onInitialize((params) => {
    const result = server.onInitialize(params);

    // Load cached findings
    const projectId = process.env.SENTINEL_PROJECT_ID ?? "default";
    findingCache.load(cacheDir, projectId);

    // Fetch fresh findings and connect SSE
    apiClient.getFindings().then((data) => {
      findingCache.upsert(data.findings);
      // Push diagnostics for already-open docs
      for (const doc of documents.all()) {
        const diagnostics = server.getDiagnosticsForFile(doc.uri);
        connection.sendDiagnostics({ uri: doc.uri, diagnostics });
      }
      findingCache.save(cacheDir, projectId);
    }).catch(() => { /* Use cached findings on failure */ });

    sseListener.connect();

    return result;
  });

  connection.onShutdown(() => {
    sseListener.disconnect();
    const projectId = process.env.SENTINEL_PROJECT_ID ?? "default";
    findingCache.save(cacheDir, projectId);
  });

  documents.onDidOpen((event) => {
    const diagnostics = server.getDiagnosticsForFile(event.document.uri);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics });
  });

  documents.onDidChangeContent((event) => {
    const diagnostics = server.getDiagnosticsForFile(event.document.uri);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics });
  });

  connection.onCodeAction((params) => {
    return server.getCodeActionsForFile(params.textDocument.uri, params.range);
  });

  connection.onCodeLens((params) => {
    return server.getCodeLensesForFile(params.textDocument.uri);
  });

  connection.onExecuteCommand(async (params) => {
    await server.handleCommand(params.command, params.arguments ?? []);
  });

  documents.listen(connection);
  connection.listen();
}
```

**Step 3: Build and verify**

Run: `cd sentinel && npx turbo build --filter=@sentinel/sentinel-lsp`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/sentinel-lsp/
git commit -m "feat(sentinel-lsp): wire LSP connection entrypoint with SSE + cache lifecycle"
```

---

## Task 8: VS Code Extension Client

**Files:**
- Create: `packages/sentinel-vscode/package.json`
- Create: `packages/sentinel-vscode/tsconfig.json`
- Create: `packages/sentinel-vscode/src/extension.ts`

**Step 1: Create `packages/sentinel-vscode/package.json`**

```json
{
  "name": "sentinel-vscode",
  "displayName": "Sentinel Security",
  "description": "Show Sentinel security findings inline in your editor",
  "version": "0.1.0",
  "publisher": "sentinel",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Linters"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      { "command": "sentinel.configure", "title": "Sentinel: Configure API Token" },
      { "command": "sentinel.openDashboard", "title": "Sentinel: Open Dashboard" },
      { "command": "sentinel.triggerScan", "title": "Sentinel: Trigger Scan" },
      { "command": "sentinel.refresh", "title": "Sentinel: Refresh Findings" }
    ],
    "configuration": {
      "title": "Sentinel",
      "properties": {
        "sentinel.apiUrl": {
          "type": "string",
          "default": "http://localhost:8080",
          "description": "Sentinel API URL"
        },
        "sentinel.orgId": {
          "type": "string",
          "default": "default",
          "description": "Organization ID"
        },
        "sentinel.projectId": {
          "type": "string",
          "default": "",
          "description": "Project ID (auto-detected if empty)"
        }
      }
    }
  },
  "scripts": {
    "build": "tsc",
    "vscode:prepublish": "tsc"
  },
  "dependencies": {
    "vscode-languageclient": "^10.0.0"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "typescript": "^5.7"
  }
}
```

**Step 2: Create `packages/sentinel-vscode/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

**Step 3: Create `packages/sentinel-vscode/src/extension.ts`**

```typescript
import * as vscode from "vscode";
import * as path from "node:path";
import { LanguageClient, TransportKind, type LanguageClientOptions, type ServerOptions } from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("sentinel");
  const apiUrl = config.get<string>("apiUrl", "http://localhost:8080");
  const orgId = config.get<string>("orgId", "default");
  const projectId = config.get<string>("projectId", "");

  // Resolve LSP server module path
  const serverModule = path.join(context.extensionPath, "..", "sentinel-lsp", "dist", "index.js");

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        env: {
          ...process.env,
          SENTINEL_API_URL: apiUrl,
          SENTINEL_API_TOKEN: await getApiToken(context),
          SENTINEL_ORG_ID: orgId,
          SENTINEL_PROJECT_ID: projectId,
        },
      },
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        env: {
          ...process.env,
          SENTINEL_API_URL: apiUrl,
          SENTINEL_API_TOKEN: await getApiToken(context),
          SENTINEL_ORG_ID: orgId,
          SENTINEL_PROJECT_ID: projectId,
        },
      },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", pattern: "**/*" }],
  };

  client = new LanguageClient("sentinel", "Sentinel Security", serverOptions, clientOptions);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("sentinel.configure", () => configureApiToken(context)),
    vscode.commands.registerCommand("sentinel.openDashboard", (findingId?: string) => {
      const url = findingId
        ? `${apiUrl.replace("/api", "")}/findings/${findingId}`
        : apiUrl.replace("/api", "");
      vscode.env.openExternal(vscode.Uri.parse(url));
    }),
  );

  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  statusBar.text = "$(shield) Sentinel";
  statusBar.tooltip = "Sentinel Security — Connected";
  statusBar.command = "sentinel.configure";
  statusBar.show();
  context.subscriptions.push(statusBar);

  await client.start();
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
  }
}

async function getApiToken(context: vscode.ExtensionContext): Promise<string> {
  return (await context.secrets.get("sentinel.apiToken")) ?? "";
}

async function configureApiToken(context: vscode.ExtensionContext): Promise<void> {
  const token = await vscode.window.showInputBox({
    prompt: "Enter your Sentinel API token",
    password: true,
    placeHolder: "paste your token here",
  });
  if (token !== undefined) {
    await context.secrets.store("sentinel.apiToken", token);
    vscode.window.showInformationMessage("Sentinel API token saved. Reload window to apply.");
  }
}
```

**Step 4: Install dependencies and build**

Run: `cd sentinel && pnpm install && npx turbo build --filter=sentinel-vscode`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add packages/sentinel-vscode/
git commit -m "feat(sentinel-vscode): add VS Code extension client for Sentinel LSP"
```

---

## Task 9: JetBrains Plugin (Kotlin + LSP4IJ)

**Files:**
- Create: `packages/sentinel-jetbrains/build.gradle.kts`
- Create: `packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml`
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/SentinelLspServerDescriptor.kt`
- Create: `packages/sentinel-jetbrains/settings.gradle.kts`
- Create: `packages/sentinel-jetbrains/package.json` (for turborepo compatibility)

**Step 1: Create `packages/sentinel-jetbrains/package.json`**

```json
{
  "name": "@sentinel/sentinel-jetbrains",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "echo 'JetBrains plugin built via Gradle — run: cd packages/sentinel-jetbrains && ./gradlew buildPlugin'",
    "test": "echo 'no tests yet'"
  }
}
```

**Step 2: Create `packages/sentinel-jetbrains/settings.gradle.kts`**

```kotlin
rootProject.name = "sentinel-jetbrains"
```

**Step 3: Create `packages/sentinel-jetbrains/build.gradle.kts`**

```kotlin
plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.25"
    id("org.jetbrains.intellij") version "1.17.4"
}

group = "com.sentinel"
version = "0.1.0"

repositories {
    mavenCentral()
}

intellij {
    version.set("2024.1")
    type.set("IC")
    plugins.set(listOf("com.redhat.devtools.lsp4ij:0.4.0"))
}

tasks {
    withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
        kotlinOptions.jvmTarget = "17"
    }
    patchPluginXml {
        sinceBuild.set("241")
        untilBuild.set("243.*")
    }
}
```

**Step 4: Create `packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml`**

```xml
<idea-plugin>
    <id>com.sentinel.intellij</id>
    <name>Sentinel Security</name>
    <vendor>Sentinel</vendor>
    <description>Show Sentinel security findings inline in your JetBrains IDE</description>

    <depends>com.intellij.modules.platform</depends>
    <depends>com.redhat.devtools.lsp4ij</depends>

    <extensions defaultExtensionNs="com.redhat.devtools.lsp4ij">
        <server id="sentinelLsp"
                name="Sentinel"
                factoryClass="com.sentinel.intellij.SentinelLspServerDescriptor"/>
    </extensions>
</idea-plugin>
```

**Step 5: Create `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/SentinelLspServerDescriptor.kt`**

```kotlin
package com.sentinel.intellij

import com.intellij.openapi.project.Project
import com.redhat.devtools.lsp4ij.server.ProcessStreamConnectionProvider
import com.redhat.devtools.lsp4ij.server.StreamConnectionProvider
import com.redhat.devtools.lsp4ij.LanguageServerFactory

class SentinelLspServerDescriptor : LanguageServerFactory {

    override fun createConnectionProvider(project: Project): StreamConnectionProvider {
        val nodePath = System.getenv("SENTINEL_NODE_PATH") ?: "node"
        val serverPath = System.getenv("SENTINEL_LSP_PATH")
            ?: findServerInProject(project)
            ?: throw IllegalStateException("Cannot find sentinel-lsp server. Set SENTINEL_LSP_PATH.")

        val env = mutableMapOf<String, String>()
        System.getenv("SENTINEL_API_URL")?.let { env["SENTINEL_API_URL"] = it }
        System.getenv("SENTINEL_API_TOKEN")?.let { env["SENTINEL_API_TOKEN"] = it }
        System.getenv("SENTINEL_ORG_ID")?.let { env["SENTINEL_ORG_ID"] = it }

        return ProcessStreamConnectionProvider(
            listOf(nodePath, serverPath, "--stdio"),
            project.basePath,
            env
        )
    }

    private fun findServerInProject(project: Project): String? {
        val basePath = project.basePath ?: return null
        val candidate = "$basePath/node_modules/@sentinel/sentinel-lsp/dist/index.js"
        return if (java.io.File(candidate).exists()) candidate else null
    }
}
```

**Step 6: Commit**

```bash
git add packages/sentinel-jetbrains/
git commit -m "feat(sentinel-jetbrains): add JetBrains plugin with LSP4IJ integration"
```

---

## Task 10: Full Build Verification + pnpm-lock Update

**Files:**
- Modify: `pnpm-lock.yaml` (auto-updated by pnpm install)

**Step 1: Install all dependencies**

Run: `cd sentinel && pnpm install`

**Step 2: Build all packages**

Run: `cd sentinel && npx turbo build`
Expected: All packages build successfully including sentinel-lsp and sentinel-vscode

**Step 3: Run all tests**

Run: `cd sentinel && npx turbo test --filter=@sentinel/sentinel-lsp`
Expected: All finding-cache, diagnostic-mapper, api-client, sse-listener, server tests PASS

**Step 4: Run existing tests to verify no regressions**

Run: `cd sentinel && npx turbo test --filter=@sentinel/api && npx turbo test --filter=@sentinel/notifications`
Expected: 142 API tests + 34 notification tests PASS

**Step 5: Commit lock file**

```bash
git add pnpm-lock.yaml
git commit -m "chore: update pnpm-lock.yaml for sentinel-lsp and sentinel-vscode dependencies"
```

---

## Summary

| Task | Component | Tests | LOC |
|------|-----------|-------|-----|
| 1 | Package scaffold + types | 0 | ~70 |
| 2 | FindingCache | 8 | ~230 |
| 3 | DiagnosticMapper | 10 | ~220 |
| 4 | SentinelApiClient | 5 | ~160 |
| 5 | SseListener | 5 | ~140 |
| 6 | LSP Server Core | 6 | ~200 |
| 7 | LSP Entrypoint | 0 | ~100 |
| 8 | VS Code Extension | 0 | ~130 |
| 9 | JetBrains Plugin | 0 | ~80 |
| 10 | Full verification | 0 | ~0 |
| **Total** | | **34** | **~1,330** |
