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
      item.tooltip = "Sentinel Security — Connected";
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
