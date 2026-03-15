# P15: VS Code Extension Parity — Design Document

**Goal:** Build a full-featured VS Code extension matching JetBrains plugin capabilities — gutter icons, findings TreeView, rich detail webview, status bar, walkthrough, on-save scan trigger — all powered by the existing shared `sentinel-lsp` server.

**Architecture:** Thin client + LSP server. Extension is a UI adaptation layer translating LSP capabilities into VS Code-native components. All intelligence (cache, API client, SSE, diagnostics) lives in `sentinel-lsp` (shared with JetBrains and Neovim).

**Tech Stack:** TypeScript, VS Code Extension API, vscode-languageclient, esbuild bundler

---

## Design Decisions

### Algorithms — SSE Push + Snapshot Reconciliation (Hybrid)

Three approaches evaluated:

| Approach | Performance | Scalability | Accuracy | Efficiency | Reliability |
|----------|-------------|-------------|----------|------------|-------------|
| A: Polling | Poor | Poor | Medium | Poor | Good |
| B: Pure SSE | Excellent | Good | Medium | Excellent | Poor |
| **C: SSE + Snapshot (Hybrid)** | **Excellent** | **Excellent** | **Excellent** | **Excellent** | **Excellent** |

**Selected: C** — SSE for real-time deltas, full API snapshot on connect/reconnect, disk cache for offline baseline. Already implemented in `sentinel-lsp` (`sse-listener.ts` + `finding-cache.ts`). The hybrid eliminates polling waste (A), SSE drift on disconnect (B), and cold-start delay.

**Why hybrid over pure SSE?** Enterprise users on corporate networks experience frequent disconnections (VPN, laptop sleep). Without snapshot reconciliation, state drift accumulates silently. The hybrid catches up on any missed events within one API round-trip on reconnect.

### Data Structures — Multi-Index HashMap

Three approaches evaluated:

| Approach | Lookup | Memory | Scalability | Complexity |
|----------|--------|--------|-------------|------------|
| A: Flat Array | O(n) | Optimal | Poor (10K+ = jank) | Trivial |
| **B: Multi-Index HashMap** | **O(1) by file** | **~2x** | **Excellent** | **Medium** |
| C: HashMap + Sorted Skip | O(1) + pre-sorted | ~2.5x | Excellent | High |

**Selected: B** — Primary `Map<findingId, Finding>` + secondary `Map<filePath, Set<findingId>>`. Already implemented in LSP's `FindingCache`. Sorting 50 items per file on render takes <1ms — pre-sorted structures (C) add complexity for negligible gain. Flat arrays (A) cause jank at scale.

**Why not hybrid (C)?** Over-engineering. LRU eviction solves a memory problem that doesn't exist (50K findings x 200 bytes = 10MB). The JetBrains plugin uses the same B pattern and performs well at enterprise scale.

### System Design — Thin Client + LSP Server

Three approaches evaluated:

| Approach | Code Reuse | Maintainability | Reliability | Latency |
|----------|-----------|-----------------|-------------|---------|
| A: Thick Client | None | Poor | Medium | Good |
| **B: Thin Client + LSP** | **Maximum** | **Excellent** | **Good** | **Good** |
| C: Thin Client + LSP + Sidecar | Maximum | Poor | Poor | Excellent |

**Selected: B** — Extension handles only VS Code-specific UI. All intelligence in shared `sentinel-lsp`. JetBrains already validates this architecture. Fix once in LSP, all IDEs benefit.

**Why not sidecar (C)?** WebSocket bridge adds process lifecycle management, port conflicts, and security surface for ~5ms latency improvement. VS Code's `postMessage` handles webview communication at sufficient throughput. Cline and Continue confirm this — both use `postMessage` for higher message volumes than we need.

### Software Design — Feature-Module Architecture

Three approaches evaluated:

| Approach | Testability | Extensibility | Onboarding | Coupling |
|----------|-------------|---------------|------------|---------|
| A: Monolithic | Poor | Poor | Medium | Maximum |
| **B: Feature-Module** | **Good** | **Excellent** | **Excellent** | **Low** |
| C: DI + Event Bus | Excellent | Excellent | Poor | Minimal |

**Selected: B** — Each UI capability is an isolated module with `activate(ctx)/deactivate()`. Shared `SentinelContext` object injected at activation. ~15 files averaging 100 lines each.

**Why not DI (C)?** DI containers solve dependency problems at ~50+ services. We have ~12 modules. Constructor injection via shared context provides equivalent testability. None of the reference VS Code extensions (Cline, Continue, Void) use DI frameworks.

---

## Component Architecture

### 1. Findings TreeView

Native VS Code TreeView with severity grouping:

```
SENTINEL FINDINGS (badge: total count)
+-- Critical (3)
|   +-- SQL Injection -- src/api/users.ts:42
|   +-- Command Injection -- src/utils/exec.ts:18
|   +-- Null Deref (formal) -- src/core/parser.py:91
+-- High (7)
|   +-- XSS Vulnerability -- src/views/profile.tsx:55
|   +-- ...
+-- Medium (12), Low (4), Info (2)
```

- Grouped by severity, sorted by priority score (severity x confidence) within groups
- Click finding: opens file at line + shows detail webview panel
- Inline actions: suppress (eye-slash icon), open in dashboard (external link icon)
- Toolbar: refresh, filter by agent, collapse all
- Badge on activity bar icon shows total count
- Auto-refreshes on LSP diagnostic changes

### 2. Finding Detail Webview

Editor-column panel (side-by-side with code). Renders on finding click.

Sections:
- **Header**: Severity badge, title, agent pill, confidence percentage
- **Code snippet**: Flagged lines with syntax highlighting (VS Code theme colors)
- **Description**: Markdown-rendered finding description
- **Remediation**: Suggested fix with code examples
- **Metadata**: CWE link, category, scanner, first detected date
- **Decision Trace** (AI detector findings): Signal timeline with weights and confidence
- **Related findings**: Other findings in same file by proximity
- **Compliance tags**: Framework controls (e.g., "SOC 2 CC6.6", "NIST MS-2.5")
- **Finding history**: Status changes over time (detected, suppressed, reopened)
- **Actions**: Suppress/unsuppress button, "View in Dashboard" link

Data: Extension sends `sentinel/findingDetail` custom LSP request. LSP calls `GET /v1/findings/{id}?include=history,compliance,trace,related`.

### 3. Gutter Icon Decorations

5 `TextEditorDecorationType` instances (one per severity) with SVG gutter icons:
- On editor open/change: query diagnostics for file, group by line, pick max severity per line
- Apply decoration ranges from diagnostic positions
- Icons reuse JetBrains SVGs (critical=red, high=orange, medium=yellow, low=blue, info=gray)

### 4. Status Bar Widget

```
$(shield) Sentinel: 3 critical, 7 high | Connected
```

- Color states: green (connected), yellow (offline/cached), red (auth error)
- Click opens command palette filtered to "Sentinel:"
- Tooltip: finding count, file count, last sync time
- Updates from LSP `sentinel/connectionStatus` notifications

### 5. On-Save Scan Trigger

- Debounced 2s after last save (configurable)
- Off by default (`sentinel.autoScanOnSave: false`)
- Sends `sentinel.triggerScan` LSP command with saved file path
- Shows progress notification; cancels on re-save within window

### 6. Getting Started Walkthrough

5-step walkthrough via `contributes.walkthroughs`:
1. Configure API Connection (sentinel.configure command)
2. Connect to Project (settings for sentinel.projectId)
3. Trigger First Scan (sentinel.triggerScan command)
4. Explore Findings (open TreeView)
5. Review in Dashboard (sentinel.openDashboard command)

Each step has completion events tied to VS Code state.

---

## LSP Extensions

One new custom request:

| Request | Direction | Payload |
|---------|-----------|---------|
| `sentinel/findingDetail` | client -> server | `{ findingId: string }` |

Returns enriched finding with history, compliance tags, decision trace, and related findings. Server calls existing API endpoints — data already exists in database.

---

## Data Flow

```
User saves file
  | (debounced 2s)
  v
Extension --sendRequest--> LSP Server --POST /v1/scans--> Sentinel API
                                                            |
                                                    (agents process)
                                                            |
                                                            v
Extension <--notification-- LSP Server <--SSE stream-- sentinel.findings
  |              |
  |         Cache updated, diagnostics refreshed
  v
VS Code diagnostic change event fires
  |
  +-> TreeView auto-refreshes
  +-> Gutter icons recomputed
  +-> Status bar count updated
  +-> Problems panel updated (free)
  +-> Detail webview refreshed (if showing affected finding)
```

Key: VS Code's diagnostic change event is the single synchronization point. No custom event bus needed.

---

## Error Handling

| Scenario | Behavior | Recovery |
|----------|----------|----------|
| LSP crash | "Sentinel LSP stopped" | vscode-languageclient auto-restarts (5x), then prompts |
| API unreachable | Status bar yellow: "Offline (cached)" | SSE reconnects with exponential backoff (1s-30s) |
| Auth invalid | Status bar red: "Auth Error" | Notification with "Configure" button |
| SSE drops | Silent reconnect | Full snapshot reconciliation on reconnect |
| Large project (50K+) | Paginated fetch | LSP fetches 500-finding pages; TreeView handles natively |
| Path mismatch | Suffix fallback | Cache suffix index matches regardless of full path |

Offline-first: disk cache loads in <100ms on startup, diagnostics publish before API connects.

---

## Testing Strategy

| Layer | Framework | Tests |
|-------|-----------|-------|
| LSP extensions | vitest | ~8 (findingDetail handler) |
| TreeView provider | vitest + vscode mock | ~10 (structure, grouping, sort, badges) |
| Detail webview | vitest (HTML snapshot) | ~8 (each section renders correctly) |
| Gutter decorations | vitest + vscode mock | ~6 (ranges, severity mapping) |
| Status bar | vitest | ~4 (state transitions, display text) |
| Commands | vitest | ~6 (configure, suppress, scan, dashboard) |
| On-save trigger | vitest | ~5 (debounce, ignore patterns, cancel) |
| Integration | @vscode/test-electron | ~5 (activation, LSP, end-to-end) |
| **Total** | | **~55 tests** |

---

## Package Structure

```
packages/sentinel-vscode/
  package.json                  # Manifest + contributes
  tsconfig.json
  esbuild.config.mjs            # Production bundler
  src/
    extension.ts                # activate/deactivate, wire modules
    context.ts                  # SentinelContext type
    features/
      tree-view.ts              # FindingsTreeProvider + TreeItems
      detail-panel.ts           # Webview panel creation + messaging
      detail-html.ts            # HTML template generation
      gutter-icons.ts           # Decoration types + ranges
      status-bar.ts             # Widget + state updates
      scan-trigger.ts           # On-save debounced scan
      walkthrough.ts            # Step definitions
    commands/
      configure.ts              # Token prompt + secrets
      trigger-scan.ts           # Manual scan
      open-dashboard.ts         # Browser launch
      suppress.ts               # Suppress/unsuppress
      show-findings.ts          # Jump to findings for line
    icons/
      sentinel-critical.svg
      sentinel-high.svg
      sentinel-medium.svg
      sentinel-low.svg
      sentinel-info.svg
  test/
    unit/
      tree-view.test.ts
      detail-panel.test.ts
      gutter-icons.test.ts
      status-bar.test.ts
      scan-trigger.test.ts
      commands.test.ts
    integration/
      extension.test.ts
  media/
    detail.css                  # Webview styles (VS Code theme vars)
    walkthrough/
      configure.svg
      scan.svg
      findings.svg
  .vscodeignore
```

~15 source files, ~1,500 lines. Matches JetBrains plugin scope.
