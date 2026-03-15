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
