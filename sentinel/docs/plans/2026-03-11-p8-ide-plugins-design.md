# P8: IDE Plugins (VS Code / JetBrains) — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build IDE extensions for VS Code, JetBrains, and Vim/Neovim that show Sentinel security findings inline in the editor with real-time updates, severity-based diagnostics, and one-click suppression.

**Architecture:** LSP server (`sentinel-lsp`) as the intelligence layer — connects to Sentinel API via SSE + REST, caches findings locally, and pushes LSP diagnostics to any connected IDE. Thin IDE clients launch the LSP server and register minimal UI enhancements.

**Tech Stack:** TypeScript (LSP server + VS Code client), Kotlin (JetBrains client), `vscode-languageserver` (LSP framework), `eventsource` (SSE client), vitest (testing).

**Research Base:** Deep analysis of Cline, Continue, Tabby, Void, and OpenCode codebases for enterprise IDE plugin patterns.

---

## Why These Changes

| Gap | Risk Without Fix | Enterprise Requirement |
|-----|-----------------|----------------------|
| No IDE integration | Developers must context-switch to dashboard to see findings | Developer experience, adoption velocity |
| No inline diagnostics | Security findings invisible during coding | Shift-left security, OWASP DevSecOps |
| No real-time finding updates | Stale findings shown after scan completes | CI/CD integration, developer trust |
| Single-IDE only | Locks out JetBrains/Vim users (40%+ of enterprise developers) | Multi-IDE support, enterprise procurement |
| No in-editor suppression | Must leave IDE to manage false positives | Developer productivity, finding triage speed |

---

## 3 Enterprise Approaches Evaluated

### Algorithms & Data Structures — Finding-to-File Mapping

**A. Exact Path Normalization with HashMap** — Normalize both API paths and editor paths to relative (strip workspace root), store in `Map<relativePath, Finding[]>`. O(1) lookup per file open. Simple, zero false positives. Breaks if Sentinel stores paths differently than workspace layout (monorepo sub-paths, symlinks).

**B. Suffix Trie on Path Segments** — Build trie keyed on reversed path segments. `src/users/controller.ts` stored as `controller.ts → users → src`. O(k) lookup where k = path depth. Handles partial path matches (monorepo sub-projects). Higher memory, overkill if paths always match exactly.

**C. Fuzzy Path Matching (Levenshtein + Filename Priority)** — Exact match first, then filename-only with Levenshtein distance on directory segments. O(1) best case, O(n*m) worst case. Handles renamed directories. Risk of false positives — dangerous for security findings. Expensive for large codebases.

**Hybrid verdict: A+B.** HashMap (A) as primary — handles 95%+ of cases. Suffix-match fallback (B, simplified) for monorepo edge cases. No fuzzy (C) — false positives in a security tool erode trust. Monorepo users running Sentinel against `packages/api/` get findings with sub-root-relative paths, but VS Code workspace might be at the repo root. Suffix matching resolves this without configuration.

### Algorithms & Data Structures — Real-time Finding Synchronization

**A. Periodic Polling with Delta Detection** — Poll `GET /v1/findings` every N seconds. Diff against local cache using finding IDs. O(n) per poll. Simple, works through any proxy. Latency = poll interval. Wastes bandwidth when nothing changes.

**B. SSE Push with Local Cache (Chosen)** — Open `GET /v1/events/stream?topics=finding.*,scan.completed`. On event, fetch updated findings for affected scan. Cache locally. O(1) per event. Near-instant updates. Zero wasted bandwidth. Leverages existing P7 SSE infrastructure.

**C. WebSocket Bidirectional Stream** — Persistent WebSocket with finding diffs. Server knows which files are open. Most efficient bandwidth. Sentinel doesn't have WebSocket infrastructure — would require new server code.

**Hybrid verdict: Not needed.** SSE (B) is the clear winner. Already implemented in Sentinel P7. Finding events already published by worker.ts. One-directional push is the right model. EventSource API handles reconnection natively.

### Algorithms & Data Structures — Finding Deduplication & Noise Reduction

**A. Hash-Based Dedup with Composite Key** — `sha256(file + lineStart + category + agentName)`. O(1) per finding. Deterministic. Line-shift problem — refactoring creates "new" findings.

**B. Bloom Filter for Seen Findings** — Probabilistic set membership. O(1), fixed memory. False positives may hide real findings. Cannot remove items. Wrong fit for security tool.

**C. Priority Queue with Severity x Confidence Scoring** — Score = `severityWeight * confidence`. Max-heap for highest-priority first. O(log n) insert. Natural ordering. Doesn't deduplicate — just prioritizes.

**Hybrid verdict: A+C (modified).** Use database finding ID (primary key) as dedup key — unique, assigned by server, avoids line-shift problem. Add severity x confidence scoring for display ordering. Skip Bloom filter — false positives in security dedup are unacceptable.

### System Design — Communication Architecture

**A. Direct HTTP REST + Polling** — Extension calls Sentinel API directly. Polls for updates. Simplest. 100-500ms latency per file open.

**B. SSE Push + REST for Mutations** — Persistent SSE for real-time events. REST for mutations (suppress, scan) and initial load. Real-time. Efficient. Battle-tested (GitHub, Sentry, Linear).

**C. LSP Server as API Proxy** — Sentinel LSP server wraps REST API. IDE communicates via LSP. Standard protocol. Multi-IDE. Extra process to manage.

**Hybrid verdict: B+C.** SSE+REST (B) as communication backbone. Wrap in LSP server (C) that translates findings into LSP diagnostics. This is the Tabby pattern — proven at scale. LSP server gives multi-IDE support from single codebase. SSE+REST gives real-time push without new infrastructure.

### System Design — Multi-IDE Support Strategy

**A. Native Extension Per IDE** — VS Code TypeScript + JetBrains Kotlin. Separate codebases. Full native API access. 2x maintenance. Feature parity drift.

**B. LSP Server with Thin IDE Clients (Chosen)** — One `sentinel-lsp` (TypeScript/Node.js). Thin clients per IDE: VS Code (50 LOC), JetBrains (Kotlin LSP4J wrapper, 200 LOC), Vim (20 LOC). One codebase for all logic. Standard protocol. Add new IDEs in hours. Tabby supports 4+ IDEs this way.

**C. Shared Core + Platform Adapters** — TypeScript core library. JetBrains launches core as child process via JSON-RPC stdio. Maximum code sharing. More complex than LSP.

**Hybrid verdict: Not needed.** LSP (B) is sufficient and optimal. Findings map to `textDocument/publishDiagnostics`. Suppress maps to `textDocument/codeAction`. Status maps to custom `sentinel/status`. LSP's sweet spot is diagnostics + code actions — exactly what we need.

### System Design — Caching & Offline Resilience

**A. No Cache (Always Online)** — Every file open fetches from API. Always fresh. Unusable offline. Slow file open (network roundtrip).

**B. File-Based JSON Cache (Chosen)** — Cache findings per project in `~/.sentinel/cache/{projectId}/findings.json`. TTL-based invalidation. Simple. Survives restarts. Handles typical finding volumes (<5K).

**C. SQLite Local Database** — Indexed queries. ACID guarantees. Handles 100K+ findings. Binary dependency complicates builds. Overkill for typical volumes.

**Hybrid verdict: Not needed.** JSON cache (B) is sufficient. Atomic write via temp+rename. <5K findings parse in <10ms. SQLite adds native dependency complexity for no benefit at our scale.

### Software Design — Extension Architecture Pattern

**A. Monolithic Extension** — Single package. Simple build. Can't share LSP server across IDEs.

**B. Layered Architecture: Core / LSP Server / IDE Clients (Chosen)** — `sentinel-lsp` (LSP server), `sentinel-vscode` (VS Code ext), `sentinel-jetbrains` (JetBrains plugin). Clean separation. LSP server testable standalone. IDE clients are thin.

**C. Microkernel with Plugin Registry** — Core kernel + feature plugins. Over-engineered for 3-4 features.

**Hybrid verdict: Not needed.** Layered (B) mirrors existing monorepo pattern. Three clean packages.

### Software Design — Diagnostic Rendering Strategy

**A. LSP DiagnosticCollection Only** — Map findings to LSP `Diagnostic`. IDE renders natively. Zero custom UI code. Works everywhere. Limited customization.

**B. DiagnosticCollection + CodeLens + CodeActions (Chosen)** — Diagnostics for squiggles. CodeLens for per-function finding count. CodeActions for "Suppress", "View Details", "Apply Fix". Rich but standard. 100% LSP-compatible.

**C. Custom Webview Overlay** — Full HTML control. VS Code only. Breaks LSP multi-IDE strategy.

**Hybrid verdict: Not needed.** B gives rich UX without custom rendering. All via standard LSP — works in VS Code, JetBrains, Vim.

### Software Design — Authentication & Security

**A. API Key in Extension Settings** — User pastes key. Stored in IDE encrypted storage. Simple. No OAuth. Manual key management.

**B. OAuth 2.0 with PKCE Flow** — Browser login, token stored. Auto-refresh. Standard enterprise SSO. Requires authorization server.

**C. HMAC-SHA256 with Managed Secrets** — Extension stores secret. Signs each request. Already implemented in Sentinel API. Shared secret (not per-user).

**Hybrid verdict: A+C.** Generate per-user API tokens (via dashboard). Store in IDE encrypted secret storage (A). Sign requests with HMAC-SHA256 using that token (C). Per-user identity + encrypted storage + compatible with existing auth middleware. No OAuth infrastructure needed yet.

---

## Component Design

### 1. Sentinel LSP Server (`packages/sentinel-lsp/`)

```typescript
// sentinel-lsp/src/server.ts
import { createConnection, TextDocuments, ProposedFeatures } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

export class SentinelLspServer {
  private connection: Connection;
  private documents: TextDocuments<TextDocument>;
  private apiClient: SentinelApiClient;
  private sseListener: SseListener;
  private findingCache: FindingCache;
  private diagnosticMapper: DiagnosticMapper;

  // Lifecycle
  onInitialize(params: InitializeParams): InitializeResult
  onInitialized(): void
  onShutdown(): void

  // Document events
  onDidOpenTextDocument(doc: TextDocument): void   // Push diagnostics for file
  onDidChangeTextDocument(doc: TextDocument): void // Refresh if needed
  onDidCloseTextDocument(doc: TextDocument): void  // Cleanup

  // Custom methods
  onTriggerScan(params: TriggerScanParams): void
  onGetStatus(): SentinelStatus
}
```

**Capabilities advertised:**
- `diagnosticProvider` — Push diagnostics on file open/change
- `codeActionProvider` — Suppress, View Details, Apply Fix
- `codeLensProvider` — Per-function finding counts
- `executeCommandProvider` — `sentinel.triggerScan`, `sentinel.suppress`, `sentinel.openDashboard`

### 2. API Client (`sentinel-lsp/src/api-client.ts`)

```typescript
export class SentinelApiClient {
  constructor(private baseUrl: string, private apiToken: string) {}

  // HMAC-SHA256 request signing (existing Sentinel pattern)
  private sign(method: string, path: string, body?: string): Headers

  // Finding operations
  getFindings(projectId: string, opts?: { severity?: string }): Promise<Finding[]>
  suppressFinding(findingId: string): Promise<void>
  unsuppressFinding(findingId: string): Promise<void>

  // Scan operations
  triggerScan(projectId: string, files: string[]): Promise<{ scanId: string }>
  getScanStatus(scanId: string): Promise<ScanStatus>

  // Project operations
  getProjects(): Promise<Project[]>
}
```

### 3. SSE Listener (`sentinel-lsp/src/sse-listener.ts`)

```typescript
export class SseListener {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30_000;

  constructor(
    private baseUrl: string,
    private apiToken: string,
    private topics: string[],
    private onEvent: (event: SentinelEvent) => void,
  ) {}

  connect(): void           // Open SSE, subscribe to topics
  disconnect(): void        // Close connection
  private reconnect(): void // Exponential backoff: min(1000 * 2^attempt, 30000)
}
```

### 4. Finding Cache (`sentinel-lsp/src/finding-cache.ts`)

```typescript
export class FindingCache {
  private findings = new Map<string, Finding>();          // id -> Finding
  private byFile = new Map<string, Set<string>>();        // relativePath -> Set<findingId>
  private bySuffix = new Map<string, Set<string>>();      // filename -> Set<relativePath> (fallback)

  load(projectId: string): void      // Load from ~/.sentinel/cache/{projectId}/findings.json
  save(projectId: string): void      // Atomic write (temp + rename)
  upsert(findings: Finding[]): void  // Add/update findings, rebuild file index
  remove(findingIds: string[]): void // Remove findings
  getForFile(absolutePath: string, workspaceRoot: string): Finding[]  // HashMap lookup + suffix fallback
  getAll(): Finding[]
  clear(): void
}
```

**Path matching algorithm:**
```typescript
getForFile(absolutePath: string, workspaceRoot: string): Finding[] {
  // 1. Try exact relative path match
  const relative = path.relative(workspaceRoot, absolutePath);
  const ids = this.byFile.get(relative);
  if (ids?.size) return [...ids].map(id => this.findings.get(id)!);

  // 2. Suffix fallback for monorepo
  const filename = path.basename(absolutePath);
  const candidates = this.bySuffix.get(filename);
  if (!candidates) return [];
  for (const candidatePath of candidates) {
    if (absolutePath.endsWith(candidatePath)) {
      return [...(this.byFile.get(candidatePath) ?? [])].map(id => this.findings.get(id)!);
    }
  }
  return [];
}
```

### 5. Diagnostic Mapper (`sentinel-lsp/src/diagnostic-mapper.ts`)

```typescript
export class DiagnosticMapper {
  // Map Sentinel severity to LSP DiagnosticSeverity
  private severityMap: Record<string, DiagnosticSeverity> = {
    critical: DiagnosticSeverity.Error,
    high: DiagnosticSeverity.Error,
    medium: DiagnosticSeverity.Warning,
    low: DiagnosticSeverity.Information,
    info: DiagnosticSeverity.Hint,
  };

  toDiagnostic(finding: Finding): Diagnostic {
    return {
      range: {
        start: { line: finding.lineStart - 1, character: 0 },
        end: { line: finding.lineEnd - 1, character: Number.MAX_VALUE },
      },
      severity: this.severityMap[finding.severity],
      code: finding.cweId ?? finding.category,
      source: `sentinel/${finding.agentName}`,
      message: finding.title ?? finding.description ?? finding.category,
      data: { findingId: finding.id },  // For code action resolution
    };
  }

  toCodeAction(finding: Finding): CodeAction[] {
    return [
      {
        title: `Suppress: ${finding.title ?? finding.category}`,
        kind: CodeActionKind.QuickFix,
        command: { command: "sentinel.suppress", arguments: [finding.id] },
        diagnostics: [this.toDiagnostic(finding)],
      },
      {
        title: "View in Sentinel Dashboard",
        kind: CodeActionKind.QuickFix,
        command: { command: "sentinel.openDashboard", arguments: [finding.id] },
      },
    ];
  }

  toCodeLens(file: string, findings: Finding[]): CodeLens[] {
    // Group by function/block (line ranges)
    const groups = this.groupByRange(findings);
    return groups.map(group => ({
      range: { start: { line: group.lineStart - 1, character: 0 }, end: { line: group.lineStart - 1, character: 0 } },
      command: {
        title: `$(warning) ${group.findings.length} Sentinel finding${group.findings.length > 1 ? "s" : ""} (${group.maxSeverity})`,
        command: "sentinel.showFindings",
        arguments: [group.findings.map(f => f.id)],
      },
    }));
  }
}
```

### 6. VS Code Extension (`packages/sentinel-vscode/`)

```typescript
// sentinel-vscode/src/extension.ts
import { LanguageClient, TransportKind } from "vscode-languageclient/node";

export function activate(context: vscode.ExtensionContext) {
  const serverModule = context.asAbsolutePath("../sentinel-lsp/dist/server.js");
  const client = new LanguageClient("sentinel", "Sentinel", {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc },
  }, {
    documentSelector: [{ scheme: "file", pattern: "**/*" }],
  });

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("sentinel.configure", configureApiToken),
    vscode.commands.registerCommand("sentinel.openDashboard", openDashboard),
  );

  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  statusBar.text = "$(shield) Sentinel";
  statusBar.show();

  client.start();
}
```

### 7. JetBrains Plugin (`packages/sentinel-jetbrains/`)

Thin Kotlin plugin using LSP4IJ (JetBrains LSP client framework):

```kotlin
// Launches sentinel-lsp via stdio
class SentinelLanguageServer : LanguageServerFactory {
    override fun createConnectionProvider(project: Project): StreamConnectionProvider {
        return ProcessStreamConnectionProvider(
            listOf("node", findServerPath(), "--stdio"),
            project.basePath
        )
    }
}
```

---

## Data Flow

```
Developer opens file in IDE
    |
    v
IDE sends textDocument/didOpen to sentinel-lsp
    |
    v
sentinel-lsp.FindingCache.getForFile(path, workspaceRoot)
    +-- HashMap lookup (O(1)) -> findings found? -> push diagnostics
    +-- Suffix fallback (O(k)) -> findings found? -> push diagnostics
    +-- No findings -> no diagnostics pushed
    |
    v
connection.sendDiagnostics({ uri, diagnostics })
    |
    v
IDE renders squiggly underlines + Problems panel
```

```
Scan completes (background)
    |
    v
Sentinel worker publishes scan.completed + finding.created events
    |
    v
SSE stream delivers to sentinel-lsp SseListener
    |
    v
sentinel-lsp fetches updated findings for scan
    |
    v
FindingCache.upsert(newFindings) + save to disk
    |
    v
For each open document affected:
    connection.sendDiagnostics({ uri, diagnostics })
    |
    v
IDE updates inline diagnostics in real-time
```

```
Developer triggers "Suppress Finding" (Ctrl+.)
    |
    v
IDE sends textDocument/codeAction to sentinel-lsp
    |
    v
sentinel-lsp returns CodeAction with command "sentinel.suppress"
    |
    v
Developer selects action
    |
    v
sentinel-lsp executes: apiClient.suppressFinding(findingId)
    +-- PATCH /v1/findings/{id} { suppressed: true }
    |
    v
FindingCache removes finding, re-pushes diagnostics
    |
    v
Squiggly underline disappears
```

---

## Error Handling

| Failure | Behavior | Recovery |
|---------|----------|----------|
| Sentinel API unreachable | Show cached findings, status bar shows "offline" | SSE reconnect with exponential backoff (1s -> 30s max) |
| API token invalid/expired | Status bar shows "auth error", diagnostics still shown from cache | Prompt user to re-enter token |
| LSP server crashes | IDE auto-restarts LSP client (standard behavior) | Server restarts, reloads cache, reconnects SSE |
| Finding cache corrupted | Delete cache, refetch from API on next connection | Automatic — cache is disposable |
| SSE heartbeat missed | EventSource triggers reconnect automatically | Built into EventSource spec |
| File not in any project | No diagnostics shown | Normal — file not tracked by Sentinel |

---

## Testing Strategy

| Component | Tests | Type |
|-----------|-------|------|
| FindingCache | 8 | Unit (load/save/upsert/remove/getForFile/suffix fallback/clear/atomic write) |
| DiagnosticMapper | 6 | Unit (severity mapping/code action/code lens/suppressed exclusion/CWE codes/grouping) |
| SentinelApiClient | 5 | Unit (HMAC signing/get findings/suppress/trigger scan/error handling) |
| SseListener | 5 | Unit (connect/reconnect backoff/event parsing/disconnect/max delay cap) |
| SentinelLspServer | 6 | Integration (initialize/didOpen diagnostics/code action/code lens/suppress command/status) |

~30 new tests, ~500 lines of test code.

---

## File Impact

| File | Action | Est. Lines |
|------|--------|-----------|
| `packages/sentinel-lsp/package.json` | Create | ~30 |
| `packages/sentinel-lsp/tsconfig.json` | Create | ~10 |
| `packages/sentinel-lsp/src/server.ts` | Create | ~200 |
| `packages/sentinel-lsp/src/api-client.ts` | Create | ~120 |
| `packages/sentinel-lsp/src/sse-listener.ts` | Create | ~80 |
| `packages/sentinel-lsp/src/finding-cache.ts` | Create | ~150 |
| `packages/sentinel-lsp/src/diagnostic-mapper.ts` | Create | ~120 |
| `packages/sentinel-lsp/src/types.ts` | Create | ~40 |
| `packages/sentinel-lsp/src/__tests__/finding-cache.test.ts` | Create | ~120 |
| `packages/sentinel-lsp/src/__tests__/diagnostic-mapper.test.ts` | Create | ~100 |
| `packages/sentinel-lsp/src/__tests__/api-client.test.ts` | Create | ~80 |
| `packages/sentinel-lsp/src/__tests__/sse-listener.test.ts` | Create | ~80 |
| `packages/sentinel-lsp/src/__tests__/server.test.ts` | Create | ~120 |
| `packages/sentinel-vscode/package.json` | Create | ~60 |
| `packages/sentinel-vscode/src/extension.ts` | Create | ~80 |
| `packages/sentinel-vscode/tsconfig.json` | Create | ~10 |
| `packages/sentinel-jetbrains/build.gradle.kts` | Create | ~40 |
| `packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml` | Create | ~30 |
| `packages/sentinel-jetbrains/src/main/kotlin/SentinelLanguageServer.kt` | Create | ~50 |

~800 LOC for LSP server, ~150 LOC for VS Code client, ~120 LOC for JetBrains client, ~500 LOC for tests. Total: ~1,570 LOC.

No new Docker services. No database migrations. No new npm dependencies beyond `vscode-languageserver`, `vscode-languageclient`, `eventsource`.
