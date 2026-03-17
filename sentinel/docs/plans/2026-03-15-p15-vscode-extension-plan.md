# P15: VS Code Extension Parity — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full-featured VS Code extension with findings TreeView, rich detail webview, gutter icons, enhanced status bar, on-save scan trigger, and Getting Started walkthrough — all powered by the existing shared `sentinel-lsp` server.

**Architecture:** Thin client + LSP server. Extension is a Feature-Module UI layer (~15 files) translating LSP capabilities into VS Code-native components. Shared `SentinelContext` object injected into each module. All intelligence (cache, API, SSE, diagnostics) lives in `sentinel-lsp`.

**Tech Stack:** TypeScript, VS Code Extension API (^1.85.0), vscode-languageclient (^9.0.1), esbuild, vitest

---

## Context for the Implementer

**Existing extension** at `packages/sentinel-vscode/` — 152-line single-file LSP client wrapper with status bar and 4 commands. We are rewriting this into a Feature-Module architecture.

**LSP server** at `packages/sentinel-lsp/` — already provides:
- Diagnostics (squiggly underlines + Problems panel) via `getDiagnosticsForFile()`
- Code actions (suppress + view dashboard) via `getCodeActionsForFile()`
- Code lenses (finding count per line) via `getCodeLensesForFile()`
- Commands: `sentinel.suppress`, `sentinel.triggerScan`, `sentinel.showFindings`, `sentinel.openDashboard`
- SSE real-time updates: subscribes to `scan.*` and `finding.*` topics
- Connection status notifications: `sentinel/connectionStatus` with `connected | offline | auth_error`
- Disk cache at `~/.sentinel/cache/{projectId}/findings.json`

**LSP types** (from `packages/sentinel-lsp/src/types.ts`):
```typescript
interface SentinelFinding {
  id: string; scanId: string; orgId: string; agentName: string;
  type: string; severity: "critical" | "high" | "medium" | "low" | "info";
  category: string | null; file: string; lineStart: number; lineEnd: number;
  title: string | null; description: string | null; remediation: string | null;
  cweId: string | null; confidence: number; suppressed: boolean; createdAt: string;
}
type ConnectionStatus = "connected" | "offline" | "auth_error";
```

**JetBrains icons** — SVG gutter icons already exist at `packages/sentinel-jetbrains/src/main/resources/icons/sentinel-{critical,high,medium,low,info}.svg`. We will copy these into the VS Code extension.

**Test approach**: vitest with `@vscode/test-electron` for integration. Unit tests mock VS Code API via a local `__mocks__/vscode.ts`.

---

### Task 1: Restructure package.json and add build tooling

**Files:**
- Modify: `packages/sentinel-vscode/package.json`
- Create: `packages/sentinel-vscode/esbuild.config.mjs`
- Create: `packages/sentinel-vscode/.vscodeignore`
- Create: `packages/sentinel-vscode/vitest.config.ts`
- Create: `packages/sentinel-vscode/test/__mocks__/vscode.ts`

**Step 1: Update package.json**

Replace the full content of `packages/sentinel-vscode/package.json`:

```json
{
  "name": "sentinel-vscode",
  "displayName": "Sentinel Security",
  "description": "AI code governance — findings, gutter icons, compliance, and audit trails inline in VS Code",
  "version": "0.2.0",
  "publisher": "sentinel",
  "license": "MIT",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Linters"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "icon": "media/sentinel-logo.png",
  "contributes": {
    "commands": [
      { "command": "sentinel.configure", "title": "Sentinel: Configure API Token" },
      { "command": "sentinel.openDashboard", "title": "Sentinel: Open Dashboard" },
      { "command": "sentinel.triggerScan", "title": "Sentinel: Trigger Scan" },
      { "command": "sentinel.refresh", "title": "Sentinel: Refresh Findings" },
      { "command": "sentinel.suppress", "title": "Sentinel: Suppress Finding" },
      { "command": "sentinel.showFindingDetail", "title": "Sentinel: Show Finding Detail" }
    ],
    "viewsContainers": {
      "activitybar": [
        {
          "id": "sentinel",
          "title": "Sentinel Security",
          "icon": "media/sentinel-activitybar.svg"
        }
      ]
    },
    "views": {
      "sentinel": [
        {
          "id": "sentinelFindings",
          "name": "Findings",
          "icon": "media/sentinel-activitybar.svg"
        }
      ]
    },
    "viewsWelcome": [
      {
        "view": "sentinelFindings",
        "contents": "No findings yet.\n[Trigger Scan](command:sentinel.triggerScan)\n[Configure API Token](command:sentinel.configure)"
      }
    ],
    "configuration": {
      "title": "Sentinel",
      "properties": {
        "sentinel.apiUrl": { "type": "string", "default": "http://localhost:8080", "description": "Sentinel API URL" },
        "sentinel.orgId": { "type": "string", "default": "default", "description": "Organization ID" },
        "sentinel.projectId": { "type": "string", "default": "", "description": "Project ID for scans" },
        "sentinel.enableGutterIcons": { "type": "boolean", "default": true, "description": "Show severity icons in the gutter" },
        "sentinel.autoScanOnSave": { "type": "boolean", "default": false, "description": "Trigger scan on file save (debounced)" },
        "sentinel.autoScanDebounceMs": { "type": "number", "default": 2000, "description": "Debounce delay for auto-scan on save (ms)" },
        "sentinel.severityThreshold": {
          "type": "string",
          "default": "info",
          "enum": ["critical", "high", "medium", "low", "info"],
          "description": "Minimum severity to show in the TreeView and gutter"
        }
      }
    },
    "walkthroughs": [
      {
        "id": "sentinel.gettingStarted",
        "title": "Getting Started with Sentinel Security",
        "description": "Set up AI code governance in your editor",
        "steps": [
          {
            "id": "sentinel.gettingStarted.configure",
            "title": "Configure API Connection",
            "description": "Enter your Sentinel API token to connect.\n[Configure Token](command:sentinel.configure)",
            "media": { "svg": "media/walkthrough/configure.svg" },
            "completionEvents": ["onContext:sentinel.configured"]
          },
          {
            "id": "sentinel.gettingStarted.project",
            "title": "Connect to Your Project",
            "description": "Set your Project ID in settings.\n[Open Settings](command:workbench.action.openSettings?%5B%22sentinel.projectId%22%5D)",
            "media": { "svg": "media/walkthrough/scan.svg" }
          },
          {
            "id": "sentinel.gettingStarted.scan",
            "title": "Trigger Your First Scan",
            "description": "Run a scan to detect findings.\n[Trigger Scan](command:sentinel.triggerScan)",
            "media": { "svg": "media/walkthrough/scan.svg" }
          },
          {
            "id": "sentinel.gettingStarted.explore",
            "title": "Explore Findings",
            "description": "Open the Sentinel panel to browse findings by severity.\n[Open Findings](command:sentinelFindings.focus)",
            "media": { "svg": "media/walkthrough/findings.svg" }
          },
          {
            "id": "sentinel.gettingStarted.dashboard",
            "title": "Review in Dashboard",
            "description": "Open the web dashboard for full compliance reports.\n[Open Dashboard](command:sentinel.openDashboard)",
            "media": { "svg": "media/walkthrough/configure.svg" }
          }
        ]
      }
    ]
  },
  "scripts": {
    "build": "node esbuild.config.mjs",
    "watch": "node esbuild.config.mjs --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "package": "vsce package --no-dependencies"
  },
  "dependencies": {
    "vscode-languageclient": "^9.0.1"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@vscode/vsce": "^3.0.0",
    "esbuild": "^0.24.0",
    "typescript": "^5.7",
    "vitest": "^3.2.0"
  }
}
```

**Step 2: Create esbuild config**

Create `packages/sentinel-vscode/esbuild.config.mjs`:

```javascript
import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const config = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  minify: !isWatch,
};

if (isWatch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log("Watching...");
} else {
  await esbuild.build(config);
  console.log("Build complete.");
}
```

**Step 3: Create .vscodeignore**

Create `packages/sentinel-vscode/.vscodeignore`:

```
src/**
test/**
esbuild.config.mjs
tsconfig.json
vitest.config.ts
.gitignore
**/*.map
```

**Step 4: Create vitest config**

Create `packages/sentinel-vscode/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 10_000,
    alias: {
      vscode: new URL("./test/__mocks__/vscode.ts", import.meta.url).pathname,
    },
  },
});
```

**Step 5: Create VS Code mock**

Create `packages/sentinel-vscode/test/__mocks__/vscode.ts`:

```typescript
export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
export const ThemeIcon = class { constructor(public id: string) {} };
export const ThemeColor = class { constructor(public id: string) {} };
export const Uri = {
  file: (p: string) => ({ fsPath: p, scheme: "file", toString: () => `file://${p}` }),
  parse: (s: string) => ({ fsPath: s.replace("file://", ""), scheme: "file", toString: () => s }),
};
export const EventEmitter = class {
  event = () => {};
  fire() {}
  dispose() {}
};
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const workspace = {
  getConfiguration: () => ({
    get: (key: string, def: unknown) => def,
  }),
  onDidSaveTextDocument: () => ({ dispose: () => {} }),
  createFileSystemWatcher: () => ({ dispose: () => {} }),
};
export const window = {
  createStatusBarItem: () => ({
    text: "", tooltip: "", command: "", backgroundColor: undefined,
    show: () => {}, hide: () => {}, dispose: () => {},
  }),
  createTreeView: (_id: string, opts: Record<string, unknown>) => ({
    ...opts, badge: undefined, dispose: () => {},
  }),
  showInputBox: async () => undefined,
  showInformationMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  createWebviewPanel: () => ({
    webview: { html: "", onDidReceiveMessage: () => ({ dispose: () => {} }), asWebviewUri: (u: unknown) => u, cspSource: "" },
    onDidDispose: () => ({ dispose: () => {} }),
    reveal: () => {},
    dispose: () => {},
  }),
};
export const commands = {
  registerCommand: (_cmd: string, _cb: (...args: unknown[]) => unknown) => ({ dispose: () => {} }),
  executeCommand: async () => undefined,
};
export const env = {
  openExternal: async () => true,
};
export const ViewColumn = { One: 1, Two: 2, Beside: -2 };
export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };
export const MarkdownString = class {
  value = "";
  constructor(v?: string) { this.value = v ?? ""; }
  appendMarkdown(s: string) { this.value += s; return this; }
};
```

**Step 6: Run build to verify tooling works**

Run: `cd packages/sentinel-vscode && npm install && node esbuild.config.mjs`
Expected: "Build complete." (may warn about missing src/extension.ts imports — that's fine, we rewrite it next)

**Step 7: Commit**

```bash
git add packages/sentinel-vscode/package.json packages/sentinel-vscode/esbuild.config.mjs packages/sentinel-vscode/.vscodeignore packages/sentinel-vscode/vitest.config.ts packages/sentinel-vscode/test/__mocks__/vscode.ts
git commit -m "feat(vscode): restructure package.json with TreeView, walkthrough, esbuild, vitest"
```

---

### Task 2: Create SentinelContext and rewrite extension.ts entry point

**Files:**
- Create: `packages/sentinel-vscode/src/context.ts`
- Rewrite: `packages/sentinel-vscode/src/extension.ts`
- Test: `packages/sentinel-vscode/test/unit/extension.test.ts`

**Step 1: Write test**

Create `packages/sentinel-vscode/test/unit/extension.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

// We test that the context type is well-formed and the module structure works
describe("SentinelContext", () => {
  it("SentinelConfig has all required fields", async () => {
    const { defaultConfig } = await import("../../src/context.js");
    expect(defaultConfig).toHaveProperty("apiUrl");
    expect(defaultConfig).toHaveProperty("orgId");
    expect(defaultConfig).toHaveProperty("enableGutterIcons");
    expect(defaultConfig).toHaveProperty("autoScanOnSave");
    expect(defaultConfig).toHaveProperty("autoScanDebounceMs");
    expect(defaultConfig).toHaveProperty("severityThreshold");
  });

  it("severityOrder ranks critical highest", async () => {
    const { severityOrder } = await import("../../src/context.js");
    expect(severityOrder.critical).toBeLessThan(severityOrder.high);
    expect(severityOrder.high).toBeLessThan(severityOrder.medium);
    expect(severityOrder.medium).toBeLessThan(severityOrder.low);
    expect(severityOrder.low).toBeLessThan(severityOrder.info);
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd packages/sentinel-vscode && npx vitest run test/unit/extension.test.ts`
Expected: FAIL — module not found

**Step 3: Create context.ts**

Create `packages/sentinel-vscode/src/context.ts`:

```typescript
import type * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface SentinelConfig {
  apiUrl: string;
  orgId: string;
  projectId: string;
  enableGutterIcons: boolean;
  autoScanOnSave: boolean;
  autoScanDebounceMs: number;
  severityThreshold: Severity;
}

export const defaultConfig: SentinelConfig = {
  apiUrl: "http://localhost:8080",
  orgId: "default",
  projectId: "",
  enableGutterIcons: true,
  autoScanOnSave: false,
  autoScanDebounceMs: 2000,
  severityThreshold: "info",
};

export const severityOrder: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export interface SentinelContext {
  client: LanguageClient;
  secrets: vscode.SecretStorage;
  output: vscode.OutputChannel;
  subscriptions: vscode.Disposable[];
  extensionUri: vscode.Uri;
  config(): SentinelConfig;
}
```

**Step 4: Rewrite extension.ts**

Replace `packages/sentinel-vscode/src/extension.ts` entirely:

```typescript
import * as path from "node:path";
import * as vscode from "vscode";
import {
  LanguageClient,
  TransportKind,
  type ServerOptions,
  type LanguageClientOptions,
} from "vscode-languageclient/node";

import type { SentinelContext, SentinelConfig, Severity } from "./context.js";
import { defaultConfig } from "./context.js";

let client: LanguageClient | undefined;

function readConfig(): SentinelConfig {
  const cfg = vscode.workspace.getConfiguration("sentinel");
  return {
    apiUrl: cfg.get<string>("apiUrl", defaultConfig.apiUrl),
    orgId: cfg.get<string>("orgId", defaultConfig.orgId),
    projectId: cfg.get<string>("projectId", defaultConfig.projectId),
    enableGutterIcons: cfg.get<boolean>("enableGutterIcons", defaultConfig.enableGutterIcons),
    autoScanOnSave: cfg.get<boolean>("autoScanOnSave", defaultConfig.autoScanOnSave),
    autoScanDebounceMs: cfg.get<number>("autoScanDebounceMs", defaultConfig.autoScanDebounceMs),
    severityThreshold: cfg.get<Severity>("severityThreshold", defaultConfig.severityThreshold),
  };
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const serverModule = path.resolve(__dirname, "..", "..", "sentinel-lsp", "dist", "index.js");
  const config = readConfig();
  const apiToken = (await context.secrets.get("sentinel.apiToken")) ?? "";

  const envVars = {
    ...process.env,
    SENTINEL_API_URL: config.apiUrl,
    SENTINEL_API_TOKEN: apiToken,
    SENTINEL_ORG_ID: config.orgId,
    SENTINEL_PROJECT_ID: config.projectId,
  };

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc, options: { env: envVars } },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { env: envVars, execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", pattern: "**/*" }],
    synchronize: { fileEvents: vscode.workspace.createFileSystemWatcher("**/*") },
  };

  client = new LanguageClient("sentinel", "Sentinel Security", serverOptions, clientOptions);

  const output = vscode.window.createOutputChannel("Sentinel");
  context.subscriptions.push(output);

  const ctx: SentinelContext = {
    client,
    secrets: context.secrets,
    output,
    subscriptions: context.subscriptions,
    extensionUri: context.extensionUri,
    config: readConfig,
  };

  // Feature modules will be activated here in subsequent tasks:
  // activateStatusBar(ctx);
  // activateTreeView(ctx);
  // activateGutterIcons(ctx);
  // activateCommands(ctx);
  // activateScanTrigger(ctx);

  await client.start();
  output.appendLine("Sentinel LSP client started.");
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
    client = undefined;
  }
}
```

**Step 5: Run test**

Run: `cd packages/sentinel-vscode && npx vitest run test/unit/extension.test.ts`
Expected: 2 tests PASS

**Step 6: Run build**

Run: `cd packages/sentinel-vscode && node esbuild.config.mjs`
Expected: "Build complete."

**Step 7: Commit**

```bash
git add packages/sentinel-vscode/src/context.ts packages/sentinel-vscode/src/extension.ts packages/sentinel-vscode/test/unit/extension.test.ts
git commit -m "feat(vscode): add SentinelContext type and rewrite entry point as Feature-Module host"
```

---

### Task 3: Status bar widget module

**Files:**
- Create: `packages/sentinel-vscode/src/features/status-bar.ts`
- Test: `packages/sentinel-vscode/test/unit/status-bar.test.ts`
- Modify: `packages/sentinel-vscode/src/extension.ts` (wire module)

**Step 1: Write test**

Create `packages/sentinel-vscode/test/unit/status-bar.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { createStatusBar, updateStatusBar } from "../../src/features/status-bar.js";

describe("StatusBar", () => {
  it("creates with default connected text", () => {
    const item = createStatusBar();
    expect(item.text).toBe("$(shield) Sentinel");
  });

  it("updates to connected state", () => {
    const item = createStatusBar();
    updateStatusBar(item, "connected", 3, 7);
    expect(item.text).toBe("$(shield) Sentinel: 3 critical, 7 high");
    expect(item.backgroundColor).toBeUndefined();
  });

  it("updates to offline state", () => {
    const item = createStatusBar();
    updateStatusBar(item, "offline", 0, 0);
    expect(item.text).toContain("offline");
    expect(item.backgroundColor).toBeDefined();
  });

  it("updates to auth_error state", () => {
    const item = createStatusBar();
    updateStatusBar(item, "auth_error", 0, 0);
    expect(item.text).toContain("auth error");
    expect(item.backgroundColor).toBeDefined();
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd packages/sentinel-vscode && npx vitest run test/unit/status-bar.test.ts`
Expected: FAIL

**Step 3: Implement status-bar.ts**

Create `packages/sentinel-vscode/src/features/status-bar.ts`:

```typescript
import * as vscode from "vscode";
import type { SentinelContext } from "../context.js";

export function createStatusBar(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.text = "$(shield) Sentinel";
  item.tooltip = "Sentinel Security";
  item.command = "sentinel.refresh";
  item.show();
  return item;
}

export function updateStatusBar(
  item: vscode.StatusBarItem,
  status: string,
  criticalCount: number,
  highCount: number,
): void {
  switch (status) {
    case "connected": {
      const counts: string[] = [];
      if (criticalCount > 0) counts.push(`${criticalCount} critical`);
      if (highCount > 0) counts.push(`${highCount} high`);
      item.text = counts.length > 0
        ? `$(shield) Sentinel: ${counts.join(", ")}`
        : "$(shield) Sentinel";
      item.tooltip = `Sentinel Security — Connected`;
      item.backgroundColor = undefined;
      break;
    }
    case "offline":
      item.text = "$(shield) Sentinel (offline)";
      item.tooltip = "Sentinel Security — API unreachable, showing cached findings";
      item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      break;
    case "auth_error":
      item.text = "$(shield) Sentinel (auth error)";
      item.tooltip = "Sentinel Security — Invalid API token. Run 'Sentinel: Configure API Token'";
      item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      break;
  }
}

export function activateStatusBar(ctx: SentinelContext): vscode.StatusBarItem {
  const statusBar = createStatusBar();
  ctx.subscriptions.push(statusBar);

  ctx.client.onNotification("sentinel/connectionStatus", (params: { status: string }) => {
    updateStatusBar(statusBar, params.status, 0, 0);
  });

  return statusBar;
}
```

**Step 4: Wire into extension.ts**

Add import and call in `extension.ts`:

```typescript
import { activateStatusBar } from "./features/status-bar.js";
```

Replace the comment `// activateStatusBar(ctx);` with:
```typescript
activateStatusBar(ctx);
```

**Step 5: Run tests**

Run: `cd packages/sentinel-vscode && npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/sentinel-vscode/src/features/status-bar.ts packages/sentinel-vscode/test/unit/status-bar.test.ts packages/sentinel-vscode/src/extension.ts
git commit -m "feat(vscode): add status bar widget with connection state and finding counts"
```

---

### Task 4: Commands module

**Files:**
- Create: `packages/sentinel-vscode/src/commands/configure.ts`
- Create: `packages/sentinel-vscode/src/commands/trigger-scan.ts`
- Create: `packages/sentinel-vscode/src/commands/open-dashboard.ts`
- Create: `packages/sentinel-vscode/src/commands/suppress.ts`
- Create: `packages/sentinel-vscode/src/commands/index.ts`
- Test: `packages/sentinel-vscode/test/unit/commands.test.ts`
- Modify: `packages/sentinel-vscode/src/extension.ts` (wire module)

**Step 1: Write test**

Create `packages/sentinel-vscode/test/unit/commands.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

describe("Commands", () => {
  it("configure command stores token in secrets", async () => {
    const { handleConfigure } = await import("../../src/commands/configure.js");
    const secrets = { store: vi.fn(), get: vi.fn() };
    const showInputBox = vi.fn().mockResolvedValue("test-token");
    await handleConfigure(secrets as any, showInputBox as any);
    expect(secrets.store).toHaveBeenCalledWith("sentinel.apiToken", "test-token");
  });

  it("configure command does nothing if cancelled", async () => {
    const { handleConfigure } = await import("../../src/commands/configure.js");
    const secrets = { store: vi.fn(), get: vi.fn() };
    const showInputBox = vi.fn().mockResolvedValue(undefined);
    await handleConfigure(secrets as any, showInputBox as any);
    expect(secrets.store).not.toHaveBeenCalled();
  });

  it("openDashboard builds correct URL", async () => {
    const { buildDashboardUrl } = await import("../../src/commands/open-dashboard.js");
    expect(buildDashboardUrl("http://localhost:8080")).toBe("http://localhost:3000");
    expect(buildDashboardUrl("https://api.sentinel.io")).toBe("https://api.sentinel.io");
    expect(buildDashboardUrl("http://sentinel.local:8080")).toBe("http://sentinel.local:3000");
  });

  it("triggerScan sends LSP command", async () => {
    const { handleTriggerScan } = await import("../../src/commands/trigger-scan.js");
    const client = { sendRequest: vi.fn().mockResolvedValue(undefined) };
    await handleTriggerScan(client as any, "proj-1", ["/foo/bar.ts"]);
    expect(client.sendRequest).toHaveBeenCalledWith(
      "workspace/executeCommand",
      { command: "sentinel.triggerScan", arguments: ["proj-1", ["/foo/bar.ts"]] },
    );
  });

  it("suppress sends LSP command and returns finding ID", async () => {
    const { handleSuppress } = await import("../../src/commands/suppress.js");
    const client = { sendRequest: vi.fn().mockResolvedValue(undefined) };
    await handleSuppress(client as any, "finding-123");
    expect(client.sendRequest).toHaveBeenCalledWith(
      "workspace/executeCommand",
      { command: "sentinel.suppress", arguments: ["finding-123"] },
    );
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd packages/sentinel-vscode && npx vitest run test/unit/commands.test.ts`
Expected: FAIL

**Step 3: Implement command modules**

Create `packages/sentinel-vscode/src/commands/configure.ts`:

```typescript
import * as vscode from "vscode";

export async function handleConfigure(
  secrets: vscode.SecretStorage,
  showInputBox: typeof vscode.window.showInputBox = vscode.window.showInputBox,
): Promise<void> {
  const token = await showInputBox({
    prompt: "Enter your Sentinel API token",
    password: true,
    placeHolder: "sntnl_...",
  });
  if (token !== undefined) {
    await secrets.store("sentinel.apiToken", token);
    vscode.commands.executeCommand("setContext", "sentinel.configured", true);
    vscode.window.showInformationMessage("Sentinel API token saved. Restart the extension to apply.");
  }
}
```

Create `packages/sentinel-vscode/src/commands/open-dashboard.ts`:

```typescript
import * as vscode from "vscode";

export function buildDashboardUrl(apiUrl: string): string {
  return apiUrl.replace(/:\d+$/, ":3000");
}

export function handleOpenDashboard(apiUrl: string, findingId?: string): void {
  let url = buildDashboardUrl(apiUrl);
  if (findingId) url += `/findings/${findingId}`;
  vscode.env.openExternal(vscode.Uri.parse(url));
}
```

Create `packages/sentinel-vscode/src/commands/trigger-scan.ts`:

```typescript
import * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";

export async function handleTriggerScan(
  client: LanguageClient,
  projectId: string,
  files: string[] = [],
): Promise<void> {
  await client.sendRequest("workspace/executeCommand", {
    command: "sentinel.triggerScan",
    arguments: [projectId, files],
  });
  vscode.window.showInformationMessage("Sentinel scan triggered.");
}
```

Create `packages/sentinel-vscode/src/commands/suppress.ts`:

```typescript
import type { LanguageClient } from "vscode-languageclient/node";

export async function handleSuppress(
  client: LanguageClient,
  findingId: string,
): Promise<void> {
  await client.sendRequest("workspace/executeCommand", {
    command: "sentinel.suppress",
    arguments: [findingId],
  });
}
```

Create `packages/sentinel-vscode/src/commands/index.ts`:

```typescript
import * as vscode from "vscode";
import type { SentinelContext } from "../context.js";
import { handleConfigure } from "./configure.js";
import { handleOpenDashboard } from "./open-dashboard.js";
import { handleTriggerScan } from "./trigger-scan.js";
import { handleSuppress } from "./suppress.js";

export function activateCommands(ctx: SentinelContext): void {
  const { client, secrets, subscriptions } = ctx;

  subscriptions.push(
    vscode.commands.registerCommand("sentinel.configure", () => handleConfigure(secrets)),
    vscode.commands.registerCommand("sentinel.openDashboard", () =>
      handleOpenDashboard(ctx.config().apiUrl),
    ),
    vscode.commands.registerCommand("sentinel.triggerScan", () =>
      handleTriggerScan(client, ctx.config().projectId),
    ),
    vscode.commands.registerCommand("sentinel.refresh", async () => {
      await client.sendRequest("workspace/executeCommand", {
        command: "sentinel.showFindings",
        arguments: [],
      });
      vscode.window.showInformationMessage("Sentinel findings refreshed.");
    }),
    vscode.commands.registerCommand("sentinel.suppress", (findingId: string) =>
      handleSuppress(client, findingId),
    ),
  );
}
```

**Step 4: Wire into extension.ts**

Add import:
```typescript
import { activateCommands } from "./commands/index.js";
```

Replace the comment `// activateCommands(ctx);` with:
```typescript
activateCommands(ctx);
```

**Step 5: Run tests**

Run: `cd packages/sentinel-vscode && npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/sentinel-vscode/src/commands/ packages/sentinel-vscode/test/unit/commands.test.ts packages/sentinel-vscode/src/extension.ts
git commit -m "feat(vscode): add command modules — configure, scan, dashboard, suppress"
```

---

### Task 5: Findings TreeView provider

**Files:**
- Create: `packages/sentinel-vscode/src/features/tree-view.ts`
- Test: `packages/sentinel-vscode/test/unit/tree-view.test.ts`
- Modify: `packages/sentinel-vscode/src/extension.ts` (wire module)

**Step 1: Write test**

Create `packages/sentinel-vscode/test/unit/tree-view.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { FindingsTreeProvider, SeverityGroup, FindingItem } from "../../src/features/tree-view.js";

const makeFinding = (id: string, severity: string, title: string, file: string, line: number) => ({
  id, scanId: "s1", orgId: "o1", agentName: "security", type: "vulnerability",
  severity, category: null, file, lineStart: line, lineEnd: line,
  title, description: null, remediation: null, cweId: null,
  confidence: 0.9, suppressed: false, createdAt: "2026-01-01",
});

describe("FindingsTreeProvider", () => {
  it("groups findings by severity", () => {
    const provider = new FindingsTreeProvider();
    provider.updateFindings([
      makeFinding("1", "critical", "SQLi", "a.ts", 1),
      makeFinding("2", "high", "XSS", "b.ts", 2),
      makeFinding("3", "critical", "RCE", "c.ts", 3),
    ]);
    const roots = provider.getChildren(undefined);
    expect(roots).toHaveLength(2);
    expect(roots[0]).toBeInstanceOf(SeverityGroup);
    expect((roots[0] as SeverityGroup).severity).toBe("critical");
    expect((roots[0] as SeverityGroup).count).toBe(2);
    expect((roots[1] as SeverityGroup).severity).toBe("high");
  });

  it("returns findings as children of severity group", () => {
    const provider = new FindingsTreeProvider();
    provider.updateFindings([
      makeFinding("1", "critical", "SQLi", "a.ts", 10),
      makeFinding("2", "critical", "RCE", "b.ts", 20),
    ]);
    const roots = provider.getChildren(undefined);
    const children = provider.getChildren(roots[0]);
    expect(children).toHaveLength(2);
    expect(children[0]).toBeInstanceOf(FindingItem);
  });

  it("sorts findings by confidence descending within group", () => {
    const provider = new FindingsTreeProvider();
    const f1 = { ...makeFinding("1", "high", "Low conf", "a.ts", 1), confidence: 0.5 };
    const f2 = { ...makeFinding("2", "high", "High conf", "b.ts", 2), confidence: 0.95 };
    provider.updateFindings([f1, f2]);
    const roots = provider.getChildren(undefined);
    const children = provider.getChildren(roots[0]);
    expect((children[0] as FindingItem).finding.id).toBe("2");
  });

  it("filters by severity threshold", () => {
    const provider = new FindingsTreeProvider();
    provider.updateFindings([
      makeFinding("1", "critical", "A", "a.ts", 1),
      makeFinding("2", "low", "B", "b.ts", 2),
      makeFinding("3", "info", "C", "c.ts", 3),
    ]);
    provider.setSeverityThreshold("medium");
    const roots = provider.getChildren(undefined);
    expect(roots).toHaveLength(1); // only critical
    expect((roots[0] as SeverityGroup).severity).toBe("critical");
  });

  it("empty findings returns empty array", () => {
    const provider = new FindingsTreeProvider();
    expect(provider.getChildren(undefined)).toHaveLength(0);
  });

  it("badge reflects total count", () => {
    const provider = new FindingsTreeProvider();
    provider.updateFindings([
      makeFinding("1", "critical", "A", "a.ts", 1),
      makeFinding("2", "high", "B", "b.ts", 2),
    ]);
    expect(provider.totalCount).toBe(2);
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd packages/sentinel-vscode && npx vitest run test/unit/tree-view.test.ts`
Expected: FAIL

**Step 3: Implement tree-view.ts**

Create `packages/sentinel-vscode/src/features/tree-view.ts`:

```typescript
import * as vscode from "vscode";
import type { SentinelContext, Severity } from "../context.js";
import { severityOrder } from "../context.js";

interface Finding {
  id: string;
  severity: string;
  title: string | null;
  description: string | null;
  category: string | null;
  file: string;
  lineStart: number;
  lineEnd: number;
  agentName: string;
  confidence: number;
  cweId: string | null;
  [key: string]: unknown;
}

const severityIcons: Record<string, string> = {
  critical: "error",
  high: "warning",
  medium: "info",
  low: "debug-stackframe-dot",
  info: "lightbulb",
};

export class SeverityGroup extends vscode.TreeItem {
  constructor(public readonly severity: string, public readonly count: number) {
    super(`${severity.charAt(0).toUpperCase() + severity.slice(1)} (${count})`, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon(severityIcons[severity] ?? "circle");
    this.contextValue = "severityGroup";
  }
}

export class FindingItem extends vscode.TreeItem {
  constructor(public readonly finding: Finding) {
    const label = finding.title ?? finding.category ?? "Unknown finding";
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = `${finding.file}:${finding.lineStart}`;
    this.tooltip = new vscode.MarkdownString(
      `**${label}**\n\nAgent: \`${finding.agentName}\` | Confidence: ${Math.round(finding.confidence * 100)}%`,
    );
    this.iconPath = new vscode.ThemeIcon(severityIcons[finding.severity] ?? "circle");
    this.contextValue = "finding";

    this.command = {
      command: "sentinel.showFindingDetail",
      title: "Show Finding Detail",
      arguments: [finding],
    };

    this.resourceUri = vscode.Uri.file(finding.file);
  }
}

type TreeNode = SeverityGroup | FindingItem;

export class FindingsTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private findings: Finding[] = [];
  private threshold: Severity = "info";
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  get totalCount(): number {
    return this.getFilteredFindings().length;
  }

  updateFindings(findings: Finding[]): void {
    this.findings = findings;
    this._onDidChangeTreeData.fire();
  }

  setSeverityThreshold(threshold: Severity): void {
    this.threshold = threshold;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return this.getRootGroups();
    }
    if (element instanceof SeverityGroup) {
      return this.getFindingsForSeverity(element.severity);
    }
    return [];
  }

  private getFilteredFindings(): Finding[] {
    const thresholdNum = severityOrder[this.threshold] ?? 4;
    return this.findings.filter(
      (f) => (severityOrder[f.severity as Severity] ?? 4) <= thresholdNum,
    );
  }

  private getRootGroups(): SeverityGroup[] {
    const filtered = this.getFilteredFindings();
    const groups = new Map<string, number>();
    for (const f of filtered) {
      groups.set(f.severity, (groups.get(f.severity) ?? 0) + 1);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => (severityOrder[a as Severity] ?? 4) - (severityOrder[b as Severity] ?? 4))
      .map(([sev, count]) => new SeverityGroup(sev, count));
  }

  private getFindingsForSeverity(severity: string): FindingItem[] {
    return this.getFilteredFindings()
      .filter((f) => f.severity === severity)
      .sort((a, b) => b.confidence - a.confidence)
      .map((f) => new FindingItem(f));
  }
}

export function activateTreeView(ctx: SentinelContext): FindingsTreeProvider {
  const provider = new FindingsTreeProvider();
  const treeView = vscode.window.createTreeView("sentinelFindings", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  ctx.subscriptions.push(treeView);

  // Listen for diagnostic changes to update the tree
  ctx.client.onNotification("sentinel/connectionStatus", () => {
    // Refresh findings from LSP cache when connection status changes
    // The LSP server refreshes diagnostics automatically — we poll the cache
  });

  return provider;
}
```

**Step 4: Wire into extension.ts**

Add import:
```typescript
import { activateTreeView } from "./features/tree-view.js";
```

Replace the comment `// activateTreeView(ctx);` with:
```typescript
const treeProvider = activateTreeView(ctx);
```

**Step 5: Run tests**

Run: `cd packages/sentinel-vscode && npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/sentinel-vscode/src/features/tree-view.ts packages/sentinel-vscode/test/unit/tree-view.test.ts packages/sentinel-vscode/src/extension.ts
git commit -m "feat(vscode): add Findings TreeView with severity grouping and threshold filtering"
```

---

### Task 6: Gutter icon decorations

**Files:**
- Create: `packages/sentinel-vscode/src/features/gutter-icons.ts`
- Create: `packages/sentinel-vscode/src/icons/sentinel-critical.svg` (+ high, medium, low, info)
- Test: `packages/sentinel-vscode/test/unit/gutter-icons.test.ts`
- Modify: `packages/sentinel-vscode/src/extension.ts` (wire module)

**Step 1: Write test**

Create `packages/sentinel-vscode/test/unit/gutter-icons.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeGutterRanges } from "../../src/features/gutter-icons.js";

describe("GutterIcons", () => {
  it("groups diagnostics by line and picks max severity", () => {
    const diagnostics = [
      { range: { start: { line: 5 }, end: { line: 5 } }, source: "sentinel/security", severity: 0 },
      { range: { start: { line: 5 }, end: { line: 5 } }, source: "sentinel/quality", severity: 1 },
      { range: { start: { line: 10 }, end: { line: 10 } }, source: "sentinel/dep", severity: 1 },
    ];
    const result = computeGutterRanges(diagnostics as any);
    expect(result.get("critical")).toHaveLength(1);
    expect(result.get("critical")![0].start.line).toBe(5);
    expect(result.get("high")).toHaveLength(1);
    expect(result.get("high")![0].start.line).toBe(10);
  });

  it("filters non-sentinel diagnostics", () => {
    const diagnostics = [
      { range: { start: { line: 1 }, end: { line: 1 } }, source: "eslint", severity: 0 },
      { range: { start: { line: 2 }, end: { line: 2 } }, source: "sentinel/security", severity: 1 },
    ];
    const result = computeGutterRanges(diagnostics as any);
    const total = Array.from(result.values()).reduce((sum, arr) => sum + arr.length, 0);
    expect(total).toBe(1);
  });

  it("returns empty map for no diagnostics", () => {
    const result = computeGutterRanges([]);
    expect(result.size).toBe(0);
  });

  it("maps DiagnosticSeverity numbers to severity strings", () => {
    const diagnostics = [
      { range: { start: { line: 1 }, end: { line: 1 } }, source: "sentinel/a", severity: 0 },
      { range: { start: { line: 2 }, end: { line: 2 } }, source: "sentinel/b", severity: 1 },
      { range: { start: { line: 3 }, end: { line: 3 } }, source: "sentinel/c", severity: 2 },
      { range: { start: { line: 4 }, end: { line: 4 } }, source: "sentinel/d", severity: 3 },
    ];
    const result = computeGutterRanges(diagnostics as any);
    expect(result.has("critical")).toBe(true);
    expect(result.has("medium")).toBe(true);
    expect(result.has("low")).toBe(true);
    expect(result.has("info")).toBe(true);
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd packages/sentinel-vscode && npx vitest run test/unit/gutter-icons.test.ts`
Expected: FAIL

**Step 3: Copy SVG icons from JetBrains**

```bash
mkdir -p packages/sentinel-vscode/src/icons
cp packages/sentinel-jetbrains/src/main/resources/icons/sentinel-critical.svg packages/sentinel-vscode/src/icons/
cp packages/sentinel-jetbrains/src/main/resources/icons/sentinel-high.svg packages/sentinel-vscode/src/icons/
cp packages/sentinel-jetbrains/src/main/resources/icons/sentinel-medium.svg packages/sentinel-vscode/src/icons/
cp packages/sentinel-jetbrains/src/main/resources/icons/sentinel-low.svg packages/sentinel-vscode/src/icons/
cp packages/sentinel-jetbrains/src/main/resources/icons/sentinel-info.svg packages/sentinel-vscode/src/icons/
```

Also create `packages/sentinel-vscode/media/sentinel-activitybar.svg` (copy from sentinel-logo.svg or create simple shield SVG):
```bash
cp packages/sentinel-jetbrains/src/main/resources/icons/sentinel-logo.svg packages/sentinel-vscode/media/sentinel-activitybar.svg
```

**Step 4: Implement gutter-icons.ts**

Create `packages/sentinel-vscode/src/features/gutter-icons.ts`:

```typescript
import * as vscode from "vscode";
import * as path from "node:path";
import type { SentinelContext } from "../context.js";

type SeverityName = "critical" | "high" | "medium" | "low" | "info";

// DiagnosticSeverity: Error=0, Warning=1, Information=2, Hint=3
// We map Error to critical (checking source for "sentinel/" prefix), Warning to medium, etc.
// But since LSP maps critical+high → Error, we use a combined approach:
// Error(0) → critical, Warning(1) → medium, Information(2) → low, Hint(3) → info
// For "high" we need source to distinguish — but LSP doesn't expose that granularity.
// Simplification: Error = critical, Warning = medium, Information = low, Hint = info
// The "high" severity gets a separate gutter via checking multiple diagnostics on the same line.
const diagSeverityToName: SeverityName[] = ["critical", "medium", "low", "info"];

// For line grouping: pick the most severe across diagnostics on that line
const severityPriority: Record<SeverityName, number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4,
};

export function computeGutterRanges(
  diagnostics: vscode.Diagnostic[],
): Map<SeverityName, vscode.Range[]> {
  const lineToSeverity = new Map<number, SeverityName>();

  for (const diag of diagnostics) {
    if (!diag.source?.startsWith("sentinel/")) continue;
    const line = diag.range.start.line;
    const sevName = diagSeverityToName[diag.severity] ?? "info";
    const existing = lineToSeverity.get(line);
    if (!existing || severityPriority[sevName] < severityPriority[existing]) {
      lineToSeverity.set(line, sevName);
    }
  }

  const result = new Map<SeverityName, vscode.Range[]>();
  for (const [line, sev] of lineToSeverity) {
    if (!result.has(sev)) result.set(sev, []);
    result.get(sev)!.push(new vscode.Range(line, 0, line, 0));
  }
  return result;
}

export function activateGutterIcons(ctx: SentinelContext): void {
  const iconDir = path.join(ctx.extensionUri.fsPath, "src", "icons");

  const decorationTypes = new Map<SeverityName, vscode.TextEditorDecorationType>();
  for (const sev of ["critical", "high", "medium", "low", "info"] as SeverityName[]) {
    decorationTypes.set(
      sev,
      vscode.window.createTextEditorDecorationType({
        gutterIconPath: path.join(iconDir, `sentinel-${sev}.svg`),
        gutterIconSize: "contain",
      }),
    );
  }

  for (const dt of decorationTypes.values()) {
    ctx.subscriptions.push(dt);
  }

  function updateEditor(editor: vscode.TextEditor | undefined): void {
    if (!editor || !ctx.config().enableGutterIcons) {
      return;
    }

    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
    const ranges = computeGutterRanges(diagnostics);

    for (const [sev, dt] of decorationTypes) {
      editor.setDecorations(dt, ranges.get(sev) ?? []);
    }
  }

  // Update on editor change
  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateEditor),
  );

  // Update on diagnostics change
  ctx.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics((e) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      if (e.uris.some((uri) => uri.toString() === editor.document.uri.toString())) {
        updateEditor(editor);
      }
    }),
  );

  // Initial update
  updateEditor(vscode.window.activeTextEditor);
}
```

**Step 5: Add Range mock to vscode mock**

Add to `test/__mocks__/vscode.ts`:

```typescript
export const Range = class {
  constructor(
    public readonly startLine: number,
    public readonly startChar: number,
    public readonly endLine: number,
    public readonly endChar: number,
  ) {}
  get start() { return { line: this.startLine, character: this.startChar }; }
  get end() { return { line: this.endLine, character: this.endChar }; }
};
export const languages = {
  getDiagnostics: () => [],
  onDidChangeDiagnostics: () => ({ dispose: () => {} }),
};
```

**Step 6: Wire into extension.ts**

Add import:
```typescript
import { activateGutterIcons } from "./features/gutter-icons.js";
```

Replace the comment `// activateGutterIcons(ctx);` with:
```typescript
activateGutterIcons(ctx);
```

**Step 7: Run tests**

Run: `cd packages/sentinel-vscode && npx vitest run`
Expected: All tests PASS

**Step 8: Commit**

```bash
git add packages/sentinel-vscode/src/features/gutter-icons.ts packages/sentinel-vscode/src/icons/ packages/sentinel-vscode/media/ packages/sentinel-vscode/test/unit/gutter-icons.test.ts packages/sentinel-vscode/test/__mocks__/vscode.ts packages/sentinel-vscode/src/extension.ts
git commit -m "feat(vscode): add severity gutter icons with SVG decorations"
```

---

### Task 7: On-save scan trigger

**Files:**
- Create: `packages/sentinel-vscode/src/features/scan-trigger.ts`
- Test: `packages/sentinel-vscode/test/unit/scan-trigger.test.ts`
- Modify: `packages/sentinel-vscode/src/extension.ts` (wire module)

**Step 1: Write test**

Create `packages/sentinel-vscode/test/unit/scan-trigger.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { createDebouncedScanner } from "../../src/features/scan-trigger.js";

describe("ScanTrigger", () => {
  it("calls triggerScan after debounce", async () => {
    vi.useFakeTimers();
    const triggerScan = vi.fn().mockResolvedValue(undefined);
    const scanner = createDebouncedScanner(triggerScan, 100);

    scanner.onSave("/workspace/src/foo.ts");
    expect(triggerScan).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(triggerScan).toHaveBeenCalledWith(["/workspace/src/foo.ts"]);
    vi.useRealTimers();
  });

  it("batches multiple saves within debounce window", async () => {
    vi.useFakeTimers();
    const triggerScan = vi.fn().mockResolvedValue(undefined);
    const scanner = createDebouncedScanner(triggerScan, 200);

    scanner.onSave("/workspace/a.ts");
    await vi.advanceTimersByTimeAsync(50);
    scanner.onSave("/workspace/b.ts");
    await vi.advanceTimersByTimeAsync(200);

    expect(triggerScan).toHaveBeenCalledTimes(1);
    expect(triggerScan).toHaveBeenCalledWith(["/workspace/a.ts", "/workspace/b.ts"]);
    vi.useRealTimers();
  });

  it("resets timer on new save", async () => {
    vi.useFakeTimers();
    const triggerScan = vi.fn().mockResolvedValue(undefined);
    const scanner = createDebouncedScanner(triggerScan, 100);

    scanner.onSave("/workspace/a.ts");
    await vi.advanceTimersByTimeAsync(80);
    scanner.onSave("/workspace/b.ts");
    await vi.advanceTimersByTimeAsync(80);
    expect(triggerScan).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(20);
    expect(triggerScan).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("dispose cancels pending scan", async () => {
    vi.useFakeTimers();
    const triggerScan = vi.fn().mockResolvedValue(undefined);
    const scanner = createDebouncedScanner(triggerScan, 100);

    scanner.onSave("/workspace/a.ts");
    scanner.dispose();
    await vi.advanceTimersByTimeAsync(200);
    expect(triggerScan).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd packages/sentinel-vscode && npx vitest run test/unit/scan-trigger.test.ts`
Expected: FAIL

**Step 3: Implement scan-trigger.ts**

Create `packages/sentinel-vscode/src/features/scan-trigger.ts`:

```typescript
import * as vscode from "vscode";
import type { SentinelContext } from "../context.js";
import { handleTriggerScan } from "../commands/trigger-scan.js";

export interface DebouncedScanner {
  onSave(filePath: string): void;
  dispose(): void;
}

export function createDebouncedScanner(
  triggerScan: (files: string[]) => Promise<void>,
  debounceMs: number,
): DebouncedScanner {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingFiles: string[] = [];

  return {
    onSave(filePath: string) {
      pendingFiles.push(filePath);
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const files = [...pendingFiles];
        pendingFiles = [];
        timer = undefined;
        await triggerScan(files);
      }, debounceMs);
    },
    dispose() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      pendingFiles = [];
    },
  };
}

export function activateScanTrigger(ctx: SentinelContext): void {
  const scanner = createDebouncedScanner(
    (files) => handleTriggerScan(ctx.client, ctx.config().projectId, files),
    ctx.config().autoScanDebounceMs,
  );

  ctx.subscriptions.push({ dispose: () => scanner.dispose() });

  ctx.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!ctx.config().autoScanOnSave) return;
      scanner.onSave(doc.uri.fsPath);
    }),
  );
}
```

**Step 4: Wire into extension.ts**

Add import:
```typescript
import { activateScanTrigger } from "./features/scan-trigger.js";
```

Replace the comment `// activateScanTrigger(ctx);` with:
```typescript
activateScanTrigger(ctx);
```

**Step 5: Run tests**

Run: `cd packages/sentinel-vscode && npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/sentinel-vscode/src/features/scan-trigger.ts packages/sentinel-vscode/test/unit/scan-trigger.test.ts packages/sentinel-vscode/src/extension.ts
git commit -m "feat(vscode): add debounced on-save scan trigger"
```

---

### Task 8: Finding detail webview panel

**Files:**
- Create: `packages/sentinel-vscode/src/features/detail-panel.ts`
- Create: `packages/sentinel-vscode/src/features/detail-html.ts`
- Create: `packages/sentinel-vscode/media/detail.css`
- Test: `packages/sentinel-vscode/test/unit/detail-panel.test.ts`
- Modify: `packages/sentinel-vscode/src/extension.ts` (wire module)

**Step 1: Write test**

Create `packages/sentinel-vscode/test/unit/detail-panel.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { renderDetailHtml } from "../../src/features/detail-html.js";

const baseFinding = {
  id: "f1", scanId: "s1", orgId: "o1", agentName: "security",
  type: "vulnerability", severity: "critical" as const, category: "vulnerability/sqli",
  file: "src/db.ts", lineStart: 42, lineEnd: 44,
  title: "SQL Injection", description: "User input flows into raw SQL query.",
  remediation: "Use parameterized queries instead of string concatenation.",
  cweId: "CWE-89", confidence: 0.95, suppressed: false, createdAt: "2026-03-15T10:00:00Z",
};

describe("DetailHTML", () => {
  it("renders severity badge", () => {
    const html = renderDetailHtml(baseFinding, {});
    expect(html).toContain("CRITICAL");
  });

  it("renders title and description", () => {
    const html = renderDetailHtml(baseFinding, {});
    expect(html).toContain("SQL Injection");
    expect(html).toContain("User input flows into raw SQL query");
  });

  it("renders remediation section", () => {
    const html = renderDetailHtml(baseFinding, {});
    expect(html).toContain("parameterized queries");
  });

  it("renders CWE link", () => {
    const html = renderDetailHtml(baseFinding, {});
    expect(html).toContain("CWE-89");
    expect(html).toContain("cwe.mitre.org");
  });

  it("renders agent and confidence", () => {
    const html = renderDetailHtml(baseFinding, {});
    expect(html).toContain("security");
    expect(html).toContain("95%");
  });

  it("renders compliance tags when provided", () => {
    const html = renderDetailHtml(baseFinding, {
      complianceTags: ["SOC 2 CC6.6", "NIST MS-2.5"],
    });
    expect(html).toContain("SOC 2 CC6.6");
    expect(html).toContain("NIST MS-2.5");
  });

  it("renders decision trace when provided", () => {
    const html = renderDetailHtml(baseFinding, {
      decisionTrace: {
        overallScore: 0.87,
        signals: [
          { category: "stylometric", weight: 0.6, confidence: 0.92 },
          { category: "timing", weight: 0.3, confidence: 0.78 },
        ],
      },
    });
    expect(html).toContain("Decision Trace");
    expect(html).toContain("stylometric");
    expect(html).toContain("87%");
  });

  it("omits decision trace section when not provided", () => {
    const html = renderDetailHtml(baseFinding, {});
    expect(html).not.toContain("Decision Trace");
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd packages/sentinel-vscode && npx vitest run test/unit/detail-panel.test.ts`
Expected: FAIL

**Step 3: Implement detail-html.ts**

Create `packages/sentinel-vscode/src/features/detail-html.ts`:

```typescript
interface Finding {
  id: string;
  severity: string;
  title: string | null;
  description: string | null;
  remediation: string | null;
  category: string | null;
  file: string;
  lineStart: number;
  lineEnd: number;
  agentName: string;
  confidence: number;
  cweId: string | null;
  createdAt: string;
  [key: string]: unknown;
}

interface Signal {
  category: string;
  weight: number;
  confidence: number;
}

interface DetailExtras {
  complianceTags?: string[];
  decisionTrace?: { overallScore: number; signals: Signal[] };
  relatedFindings?: Finding[];
  history?: Array<{ status: string; timestamp: string }>;
}

const severityColors: Record<string, string> = {
  critical: "#e53e3e",
  high: "#ed8936",
  medium: "#ecc94b",
  low: "#4299e1",
  info: "#a0aec0",
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderDetailHtml(finding: Finding, extras: DetailExtras, cssUri?: string): string {
  const sev = finding.severity;
  const sevColor = severityColors[sev] ?? "#a0aec0";
  const confidencePct = Math.round(finding.confidence * 100);

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">`;
  if (cssUri) {
    html += `<link rel="stylesheet" href="${cssUri}">`;
  }
  html += `<style>
    body { font-family: var(--vscode-font-family, sans-serif); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; line-height: 1.6; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; color: #fff; }
    .section { margin-top: 16px; }
    .section h3 { font-size: 13px; margin-bottom: 4px; color: var(--vscode-descriptionForeground); }
    .tag { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 11px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); margin: 2px 2px; }
    .signal-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--vscode-widget-border); font-size: 12px; }
    a { color: var(--vscode-textLink-foreground); }
    code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; font-size: 12px; }
  </style></head><body>`;

  // Header
  html += `<div><span class="badge" style="background:${sevColor}">${escapeHtml(sev.toUpperCase())}</span>`;
  html += ` <span class="tag">${escapeHtml(finding.agentName)}</span>`;
  html += ` <span style="font-size:12px;color:var(--vscode-descriptionForeground)"> ${confidencePct}% confidence</span></div>`;

  // Title
  html += `<h2 style="margin:8px 0 4px">${escapeHtml(finding.title ?? finding.category ?? "Finding")}</h2>`;
  html += `<div style="font-size:12px;color:var(--vscode-descriptionForeground)">${escapeHtml(finding.file)}:${finding.lineStart}-${finding.lineEnd}</div>`;

  // Description
  if (finding.description) {
    html += `<div class="section"><h3>Description</h3><p style="font-size:13px">${escapeHtml(finding.description)}</p></div>`;
  }

  // Remediation
  if (finding.remediation) {
    html += `<div class="section"><h3>Remediation</h3><p style="font-size:13px">${escapeHtml(finding.remediation)}</p></div>`;
  }

  // Metadata
  html += `<div class="section"><h3>Metadata</h3><div style="font-size:12px">`;
  if (finding.cweId) {
    html += `<div>CWE: <a href="https://cwe.mitre.org/data/definitions/${finding.cweId.replace("CWE-", "")}.html">${escapeHtml(finding.cweId)}</a></div>`;
  }
  if (finding.category) {
    html += `<div>Category: <code>${escapeHtml(finding.category)}</code></div>`;
  }
  html += `<div>Detected: ${escapeHtml(new Date(finding.createdAt).toLocaleDateString())}</div>`;
  html += `</div></div>`;

  // Compliance tags
  if (extras.complianceTags && extras.complianceTags.length > 0) {
    html += `<div class="section"><h3>Compliance</h3><div>`;
    for (const tag of extras.complianceTags) {
      html += `<span class="tag">${escapeHtml(tag)}</span>`;
    }
    html += `</div></div>`;
  }

  // Decision trace
  if (extras.decisionTrace) {
    const trace = extras.decisionTrace;
    html += `<div class="section"><h3>Decision Trace</h3>`;
    html += `<div style="font-size:12px;margin-bottom:8px">Overall AI detection score: <strong>${Math.round(trace.overallScore * 100)}%</strong></div>`;
    for (const signal of trace.signals) {
      html += `<div class="signal-row"><span>${escapeHtml(signal.category)}</span><span>weight: ${signal.weight} | confidence: ${Math.round(signal.confidence * 100)}%</span></div>`;
    }
    html += `</div>`;
  }

  // History
  if (extras.history && extras.history.length > 0) {
    html += `<div class="section"><h3>History</h3><div style="font-size:12px">`;
    for (const entry of extras.history) {
      html += `<div>${escapeHtml(new Date(entry.timestamp).toLocaleDateString())} — ${escapeHtml(entry.status)}</div>`;
    }
    html += `</div></div>`;
  }

  html += `</body></html>`;
  return html;
}
```

**Step 4: Implement detail-panel.ts**

Create `packages/sentinel-vscode/src/features/detail-panel.ts`:

```typescript
import * as vscode from "vscode";
import type { SentinelContext } from "../context.js";
import { renderDetailHtml } from "./detail-html.js";

let currentPanel: vscode.WebviewPanel | undefined;

export function activateDetailPanel(ctx: SentinelContext): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand("sentinel.showFindingDetail", async (finding: Record<string, unknown>) => {
      if (!finding?.id) return;

      if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.Beside);
      } else {
        currentPanel = vscode.window.createWebviewPanel(
          "sentinelFindingDetail",
          "Sentinel: Finding Detail",
          vscode.ViewColumn.Beside,
          { enableScripts: false, localResourceRoots: [] },
        );
        currentPanel.onDidDispose(() => { currentPanel = undefined; }, null, ctx.subscriptions);
      }

      // Try to fetch enriched detail from LSP
      let extras: Record<string, unknown> = {};
      try {
        const detail = await ctx.client.sendRequest("sentinel/findingDetail", { findingId: finding.id });
        if (detail && typeof detail === "object") {
          extras = detail as Record<string, unknown>;
        }
      } catch {
        // LSP doesn't support findingDetail yet — render with basic data
      }

      currentPanel.title = `Finding: ${(finding.title as string) ?? "Detail"}`;
      currentPanel.webview.html = renderDetailHtml(finding as any, extras);

      // Also open the file at the finding's line
      const filePath = finding.file as string;
      const lineStart = (finding.lineStart as number) ?? 1;
      if (filePath) {
        const uri = vscode.Uri.file(filePath);
        const position = new vscode.Position(lineStart - 1, 0);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One, true);
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          editor.selection = new vscode.Selection(position, position);
          editor.revealRange(new vscode.Range(position, position));
        }
      }
    }),
  );
}
```

**Step 5: Add Position/Selection/Range to vscode mock**

Add to `test/__mocks__/vscode.ts`:

```typescript
export const Position = class {
  constructor(public line: number, public character: number) {}
};
export const Selection = class {
  constructor(public anchor: any, public active: any) {}
};
```

**Step 6: Create detail.css**

Create `packages/sentinel-vscode/media/detail.css`:

```css
/* Webview styles — uses VS Code CSS variables for theme integration */
body {
  font-family: var(--vscode-font-family, sans-serif);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  padding: 16px;
  line-height: 1.6;
  max-width: 720px;
}
```

**Step 7: Wire into extension.ts**

Add import:
```typescript
import { activateDetailPanel } from "./features/detail-panel.js";
```

Add after TreeView activation:
```typescript
activateDetailPanel(ctx);
```

**Step 8: Run tests**

Run: `cd packages/sentinel-vscode && npx vitest run`
Expected: All tests PASS

**Step 9: Commit**

```bash
git add packages/sentinel-vscode/src/features/detail-panel.ts packages/sentinel-vscode/src/features/detail-html.ts packages/sentinel-vscode/media/detail.css packages/sentinel-vscode/test/unit/detail-panel.test.ts packages/sentinel-vscode/test/__mocks__/vscode.ts packages/sentinel-vscode/src/extension.ts
git commit -m "feat(vscode): add rich finding detail webview with compliance tags and decision trace"
```

---

### Task 9: Wire TreeView to LSP diagnostics + finding count sync

**Files:**
- Modify: `packages/sentinel-vscode/src/extension.ts` (diagnostic listener wiring)
- Test: `packages/sentinel-vscode/test/unit/diagnostic-sync.test.ts`

**Step 1: Write test**

Create `packages/sentinel-vscode/test/unit/diagnostic-sync.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { extractFindingsFromDiagnostics } from "../../src/features/tree-view.js";

describe("Diagnostic sync", () => {
  it("extracts finding data from diagnostic.data", () => {
    const diag = {
      source: "sentinel/security",
      severity: 0,
      message: "SQL Injection",
      range: { start: { line: 5, character: 0 }, end: { line: 5, character: 100 } },
      code: "CWE-89",
      data: {
        findingId: "f-123",
        finding: {
          id: "f-123", severity: "critical", title: "SQL Injection",
          file: "src/db.ts", lineStart: 6, lineEnd: 6, agentName: "security",
          confidence: 0.95, category: "vulnerability/sqli",
        },
      },
    };
    const findings = extractFindingsFromDiagnostics([diag as any]);
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe("f-123");
  });

  it("skips non-sentinel diagnostics", () => {
    const diag = { source: "eslint", severity: 1, message: "no-var", range: { start: { line: 0 }, end: { line: 0 } } };
    const findings = extractFindingsFromDiagnostics([diag as any]);
    expect(findings).toHaveLength(0);
  });
});
```

**Step 2: Add extractFindingsFromDiagnostics to tree-view.ts**

Add this export to `packages/sentinel-vscode/src/features/tree-view.ts`:

```typescript
export function extractFindingsFromDiagnostics(diagnostics: vscode.Diagnostic[]): Finding[] {
  const findings: Finding[] = [];
  for (const diag of diagnostics) {
    if (!diag.source?.startsWith("sentinel/")) continue;
    const data = diag.data as { finding?: Finding } | undefined;
    if (data?.finding) {
      findings.push(data.finding);
    }
  }
  return findings;
}
```

**Step 3: Update extension.ts to sync diagnostics to TreeView**

In `extension.ts`, after `activateDetailPanel(ctx)`, add:

```typescript
// Sync LSP diagnostics to TreeView and status bar
const statusBarItem = activateStatusBar(ctx);  // move statusBar activation to capture reference

// Listen to diagnostic changes to update TreeView
ctx.subscriptions.push(
  vscode.languages.onDidChangeDiagnostics(() => {
    const allDiags = vscode.languages.getDiagnostics();
    const sentinelFindings: Array<Record<string, unknown>> = [];
    let criticalCount = 0;
    let highCount = 0;

    for (const [, diags] of allDiags) {
      for (const d of diags) {
        if (!d.source?.startsWith("sentinel/")) continue;
        const data = d.data as { finding?: Record<string, unknown> } | undefined;
        if (data?.finding) {
          sentinelFindings.push(data.finding);
          const sev = data.finding.severity as string;
          if (sev === "critical") criticalCount++;
          if (sev === "high") highCount++;
        }
      }
    }

    treeProvider.updateFindings(sentinelFindings as any);
    updateStatusBar(statusBarItem, "connected", criticalCount, highCount);
  }),
);
```

Note: adjust `activateStatusBar` call position — it should return the item so we can update it. The existing `activateStatusBar` already returns `StatusBarItem`.

**Step 4: Run tests**

Run: `cd packages/sentinel-vscode && npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/sentinel-vscode/src/features/tree-view.ts packages/sentinel-vscode/test/unit/diagnostic-sync.test.ts packages/sentinel-vscode/src/extension.ts
git commit -m "feat(vscode): sync LSP diagnostics to TreeView and status bar counts"
```

---

### Task 10: Walkthrough media assets + final wiring

**Files:**
- Create: `packages/sentinel-vscode/media/walkthrough/configure.svg`
- Create: `packages/sentinel-vscode/media/walkthrough/scan.svg`
- Create: `packages/sentinel-vscode/media/walkthrough/findings.svg`
- Verify: full extension activation works

**Step 1: Create walkthrough SVGs**

Create simple placeholder SVGs for each step:

Create `packages/sentinel-vscode/media/walkthrough/configure.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150">
  <rect width="200" height="150" rx="8" fill="#1e1e2e"/>
  <circle cx="100" cy="60" r="30" fill="#4fc3f7" opacity="0.8"/>
  <rect x="85" y="50" width="30" height="20" rx="3" fill="#1e1e2e"/>
  <text x="100" y="120" text-anchor="middle" fill="#cdd6f4" font-family="sans-serif" font-size="14">Configure API Token</text>
</svg>
```

Create `packages/sentinel-vscode/media/walkthrough/scan.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150">
  <rect width="200" height="150" rx="8" fill="#1e1e2e"/>
  <circle cx="100" cy="60" r="30" fill="#a6e3a1" opacity="0.8"/>
  <polygon points="90,45 90,75 115,60" fill="#1e1e2e"/>
  <text x="100" y="120" text-anchor="middle" fill="#cdd6f4" font-family="sans-serif" font-size="14">Trigger Scan</text>
</svg>
```

Create `packages/sentinel-vscode/media/walkthrough/findings.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150">
  <rect width="200" height="150" rx="8" fill="#1e1e2e"/>
  <rect x="40" y="35" width="120" height="14" rx="3" fill="#f38ba8" opacity="0.8"/>
  <rect x="40" y="55" width="120" height="14" rx="3" fill="#fab387" opacity="0.8"/>
  <rect x="40" y="75" width="120" height="14" rx="3" fill="#f9e2af" opacity="0.6"/>
  <text x="100" y="120" text-anchor="middle" fill="#cdd6f4" font-family="sans-serif" font-size="14">Explore Findings</text>
</svg>
```

**Step 2: Run full test suite**

Run: `cd packages/sentinel-vscode && npx vitest run`
Expected: All tests PASS (~30+ tests)

**Step 3: Run build**

Run: `cd packages/sentinel-vscode && node esbuild.config.mjs`
Expected: "Build complete."

**Step 4: Verify final extension.ts has all modules wired**

The final `extension.ts` `activate()` function should call:
1. `activateStatusBar(ctx)` — returns StatusBarItem
2. `activateCommands(ctx)`
3. `activateTreeView(ctx)` — returns FindingsTreeProvider
4. `activateDetailPanel(ctx)`
5. `activateGutterIcons(ctx)`
6. `activateScanTrigger(ctx)`
7. Diagnostic change listener wiring TreeView + StatusBar

**Step 5: Commit**

```bash
git add packages/sentinel-vscode/media/walkthrough/ packages/sentinel-vscode/media/sentinel-activitybar.svg
git commit -m "feat(vscode): add walkthrough media assets and finalize extension wiring"
```

---

### Task 11: LSP findingDetail extension

**Files:**
- Modify: `packages/sentinel-lsp/src/server.ts` (add findingDetail handler)
- Modify: `packages/sentinel-lsp/src/api-client.ts` (add getFindingDetail method)
- Test: `packages/sentinel-lsp/src/__tests__/server.test.ts` (add findingDetail test)

**Step 1: Add getFindingDetail to api-client.ts**

Add this method to the `SentinelApiClient` class in `packages/sentinel-lsp/src/api-client.ts`:

```typescript
async getFindingDetail(findingId: string): Promise<Record<string, unknown>> {
  const url = `${this.apiUrl}/v1/findings/${findingId}?include=history,compliance,trace,related`;
  const res = await this.signedFetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`getFindingDetail failed: ${res.status}`);
  return res.json();
}
```

**Step 2: Add handleFindingDetail to server.ts**

Add to the server factory in `packages/sentinel-lsp/src/server.ts`:

```typescript
async function handleFindingDetail(findingId: string): Promise<Record<string, unknown>> {
  // Try API first for enriched data
  try {
    return await apiClient.getFindingDetail(findingId);
  } catch {
    // Fallback to cache
    const cached = findingCache.getAll().find((f) => f.id === findingId);
    return cached ? { finding: cached } : {};
  }
}
```

Add `handleFindingDetail` to the returned object.

**Step 3: Wire in index.ts**

In `packages/sentinel-lsp/src/index.ts`, add a custom request handler after the `onExecuteCommand`:

```typescript
connection.onRequest("sentinel/findingDetail", async (params: { findingId: string }) => {
  return server.handleFindingDetail(params.findingId);
});
```

**Step 4: Write test**

Add to `packages/sentinel-lsp/src/__tests__/server.test.ts`:

```typescript
it("handleFindingDetail returns enriched data from API", async () => {
  const apiClient = { getFindingDetail: vi.fn().mockResolvedValue({ finding: { id: "f1" }, complianceTags: ["SOC 2"] }) } as any;
  const server = createSentinelLspServer({ apiClient, sseListener: {} as any, findingCache: new FindingCache() });
  const result = await server.handleFindingDetail("f1");
  expect(result).toHaveProperty("complianceTags");
});

it("handleFindingDetail falls back to cache on API failure", async () => {
  const apiClient = { getFindingDetail: vi.fn().mockRejectedValue(new Error("offline")) } as any;
  const cache = new FindingCache();
  cache.upsert([{ id: "f1", severity: "high", file: "a.ts" } as any]);
  const server = createSentinelLspServer({ apiClient, sseListener: {} as any, findingCache: cache });
  const result = await server.handleFindingDetail("f1");
  expect(result).toHaveProperty("finding");
});
```

**Step 5: Run LSP tests**

Run: `cd packages/sentinel-lsp && npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/sentinel-lsp/src/server.ts packages/sentinel-lsp/src/api-client.ts packages/sentinel-lsp/src/index.ts packages/sentinel-lsp/src/__tests__/server.test.ts
git commit -m "feat(lsp): add sentinel/findingDetail request for enriched finding data"
```

---

### Task 12: Run full test suite and verify

**Step 1: Run VS Code extension tests**

Run: `cd packages/sentinel-vscode && npx vitest run`
Expected: All tests PASS (~35 tests)

**Step 2: Run LSP tests**

Run: `cd packages/sentinel-lsp && npx vitest run`
Expected: All tests PASS

**Step 3: Build extension**

Run: `cd packages/sentinel-vscode && node esbuild.config.mjs`
Expected: "Build complete."

**Step 4: Verify git log**

Run: `git log --oneline feature/p15-vscode-extension --not main`
Expected: Clean commit history with ~11 commits

**Step 5: Commit any remaining fixes**

---

### Task 13: Complete branch — PR or merge

Use `superpowers:finishing-a-development-branch` to present options and complete the work.
