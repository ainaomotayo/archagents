import * as vscode from "vscode";
import type { SentinelContext } from "../context.js";
import { handleConfigure } from "./configure.js";
import { handleOpenDashboard } from "./open-dashboard.js";
import { handleTriggerScan } from "./trigger-scan.js";
import { handleShowFindings } from "./show-findings.js";
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
    vscode.commands.registerCommand("sentinel.showFindings", (filePath?: string, line?: number) =>
      handleShowFindings(filePath, line),
    ),
    vscode.commands.registerCommand("sentinel.suppress", (findingId: string) =>
      handleSuppress(client, findingId),
    ),
  );
}
