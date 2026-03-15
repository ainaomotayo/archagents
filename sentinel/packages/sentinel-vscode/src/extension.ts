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
import { activateStatusBar, updateStatusBar } from "./features/status-bar.js";
import { activateCommands } from "./commands/index.js";
import { activateTreeView } from "./features/tree-view.js";
import { activateGutterIcons } from "./features/gutter-icons.js";
import { activateScanTrigger } from "./features/scan-trigger.js";
import { activateDetailPanel } from "./features/detail-panel.js";

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
  const statusBarItem = activateStatusBar(ctx);
  const { provider: treeProvider, treeView } = activateTreeView(ctx);
  activateGutterIcons(ctx);
  activateCommands(ctx);
  activateScanTrigger(ctx);
  activateDetailPanel(ctx);

  // Sync LSP diagnostics to TreeView and status bar
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
      treeView.badge = { value: treeProvider.totalCount, tooltip: `${treeProvider.totalCount} findings` };
      updateStatusBar(statusBarItem, "connected", criticalCount, highCount);
    }),
  );

  await client.start();
  output.appendLine("Sentinel LSP client started.");
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
    client = undefined;
  }
}
