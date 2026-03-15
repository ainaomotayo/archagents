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
