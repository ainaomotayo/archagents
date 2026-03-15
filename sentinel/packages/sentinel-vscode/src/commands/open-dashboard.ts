import * as vscode from "vscode";

export function buildDashboardUrl(apiUrl: string): string {
  return apiUrl.replace(/:\d+$/, ":3000");
}

export function handleOpenDashboard(apiUrl: string, findingId?: string): void {
  let url = buildDashboardUrl(apiUrl);
  if (findingId) url += `/findings/${findingId}`;
  vscode.env.openExternal(vscode.Uri.parse(url));
}
