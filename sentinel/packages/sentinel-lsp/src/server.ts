import {
  type InitializeParams,
  type InitializeResult,
  TextDocumentSyncKind,
  type Diagnostic,
  type CodeAction,
  type CodeLens,
  type Range,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import type { SentinelApiClient } from "./api-client.js";
import type { SseListener } from "./sse-listener.js";
import type { FindingCache } from "./finding-cache.js";
import { DiagnosticMapper } from "./diagnostic-mapper.js";
import type { SentinelEvent } from "./types.js";

export interface ServerDeps {
  apiClient: SentinelApiClient;
  sseListener: SseListener;
  findingCache: FindingCache;
}

export function createSentinelLspServer(deps: ServerDeps) {
  const { apiClient, findingCache } = deps;
  const diagnosticMapper = new DiagnosticMapper();
  let workspaceRoot = "";

  function setWorkspaceRoot(root: string): void {
    workspaceRoot = root;
  }

  function onInitialize(params: InitializeParams): InitializeResult {
    if (params.rootUri) {
      workspaceRoot = URI.parse(params.rootUri).fsPath;
    }

    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        diagnosticProvider: {
          interFileDependencies: false,
          workspaceDiagnostics: false,
        },
        codeActionProvider: true,
        codeLensProvider: { resolveProvider: false },
        executeCommandProvider: {
          commands: [
            "sentinel.suppress",
            "sentinel.openDashboard",
            "sentinel.triggerScan",
            "sentinel.showFindings",
          ],
        },
      },
    };
  }

  function getDiagnosticsForFile(uri: string): Diagnostic[] {
    const fsPath = URI.parse(uri).fsPath;
    const findings = findingCache.getForFile(fsPath, workspaceRoot);
    return findings.map((f) => diagnosticMapper.toDiagnostic(f));
  }

  function getCodeActionsForFile(uri: string, range: Range): CodeAction[] {
    const fsPath = URI.parse(uri).fsPath;
    const findings = findingCache.getForFile(fsPath, workspaceRoot);

    const overlapping = findings.filter((f) => {
      const fStart = f.lineStart - 1;
      const fEnd = f.lineEnd - 1;
      return fStart <= range.end.line && fEnd >= range.start.line;
    });

    return overlapping.flatMap((f) => diagnosticMapper.toCodeActions(f));
  }

  function getCodeLensesForFile(uri: string): CodeLens[] {
    const fsPath = URI.parse(uri).fsPath;
    const findings = findingCache.getForFile(fsPath, workspaceRoot);
    return diagnosticMapper.toCodeLenses(findings);
  }

  async function handleCommand(command: string, args: unknown[]): Promise<unknown> {
    if (command === "sentinel.suppress") {
      const findingId = args[0] as string;
      await apiClient.suppressFinding(findingId);
      findingCache.remove([findingId]);
    } else if (command === "sentinel.triggerScan") {
      const projectId = args[0] as string;
      const files = (args[1] as string[] | undefined) ?? [];
      return apiClient.triggerScan(projectId, files);
    } else if (command === "sentinel.showFindings") {
      const findingIds = args[0] as string[];
      return findingIds;
    } else if (command === "sentinel.openDashboard") {
      const findingId = args[0] as string | undefined;
      return { command: "openDashboard", findingId };
    }
  }

  async function handleSseEvent(event: SentinelEvent): Promise<void> {
    if (
      event.topic.startsWith("finding.") ||
      event.topic === "scan.completed"
    ) {
      try {
        const result = await apiClient.getFindings();
        findingCache.clear();
        findingCache.upsert(result.findings);
      } catch {
        // API unreachable during SSE event — continue using cached findings
      }
    }
  }

  return {
    onInitialize,
    getDiagnosticsForFile,
    getCodeActionsForFile,
    getCodeLensesForFile,
    handleCommand,
    handleSseEvent,
    setWorkspaceRoot,
  };
}
