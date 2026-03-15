import * as vscode from "vscode";
import * as path from "node:path";
import type { SentinelContext } from "../context.js";

type SeverityName = "critical" | "high" | "medium" | "low" | "info";

// DiagnosticSeverity: Error=0, Warning=1, Information=2, Hint=3
const diagSeverityToName: SeverityName[] = ["critical", "high", "low", "info"];

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

  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateEditor),
  );
  ctx.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics((e) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      if (e.uris.some((uri: vscode.Uri) => uri.toString() === editor.document.uri.toString())) {
        updateEditor(editor);
      }
    }),
  );
  updateEditor(vscode.window.activeTextEditor);
}
