import type * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface SentinelConfig {
  apiUrl: string;
  orgId: string;
  projectId: string;
  enableGutterIcons: boolean;
  autoScanOnSave: boolean;
  autoScanDebounceMs: number;
  severityThreshold: Severity;
}

export const defaultConfig: SentinelConfig = {
  apiUrl: "http://localhost:8080",
  orgId: "default",
  projectId: "",
  enableGutterIcons: true,
  autoScanOnSave: false,
  autoScanDebounceMs: 2000,
  severityThreshold: "info",
};

export const severityOrder: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export interface SentinelContext {
  client: LanguageClient;
  secrets: vscode.SecretStorage;
  output: vscode.OutputChannel;
  subscriptions: vscode.Disposable[];
  extensionUri: vscode.Uri;
  config(): SentinelConfig;
}
