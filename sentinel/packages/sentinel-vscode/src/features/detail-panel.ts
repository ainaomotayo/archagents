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
        // LSP doesn't support findingDetail yet -- render with basic data
      }

      currentPanel.title = `Finding: ${(finding.title as string) ?? "Detail"}`;
      currentPanel.webview.html = renderDetailHtml(finding as any, extras);
    }),
  );
}
