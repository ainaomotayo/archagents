import * as vscode from "vscode";

export function handleShowFindings(filePath?: string, line?: number): void {
  // Focus the Sentinel findings panel
  vscode.commands.executeCommand("sentinelFindings.focus");

  // If a specific file and line were provided, open the file at that line
  if (filePath && line !== undefined) {
    const uri = vscode.Uri.file(filePath);
    vscode.commands.executeCommand("vscode.open", uri, {
      selection: new vscode.Range(line - 1, 0, line - 1, 0),
    });
  }
}
