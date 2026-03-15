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
    (files) =>
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Sentinel: Scanning...",
          cancellable: false,
        },
        () => handleTriggerScan(ctx.client, ctx.config().projectId, files),
      ),
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
