#!/usr/bin/env node
import {
  TextDocuments,
  ProposedFeatures,
  type TextDocumentChangeEvent,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { createSentinelLspServer } from "./server.js";
import { SentinelApiClient } from "./api-client.js";
import { SseListener } from "./sse-listener.js";
import { FindingCache } from "./finding-cache.js";
import type { SentinelFinding, ConnectionStatus } from "./types.js";

// Re-exports for library usage
export { FindingCache } from "./finding-cache.js";
export { DiagnosticMapper } from "./diagnostic-mapper.js";
export { SentinelApiClient, type FindingsQuery } from "./api-client.js";
export { SseListener, type EventSourceLike, type EventSourceConstructor } from "./sse-listener.js";
export { createSentinelLspServer, type ServerDeps } from "./server.js";
export type { SentinelFinding, SentinelProject, SentinelEvent, LspServerConfig, ConnectionStatus } from "./types.js";

// Node-specific createConnection (vscode-languageserver/node subpath has incomplete typings in v9)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createConnection: createNodeConnection } = require("vscode-languageserver/node") as {
  createConnection: (...args: unknown[]) => ReturnType<typeof import("vscode-languageserver").createConnection>;
};

// Only start the server when running as a process (not when imported in tests)
const isDirectRun = process.argv[1]?.endsWith("index.js") || process.argv.includes("--stdio");
if (isDirectRun && process.env.NODE_ENV !== "test") {
  const connection = createNodeConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);

  const apiUrl = process.env.SENTINEL_API_URL ?? "http://localhost:8080";
  const apiToken = process.env.SENTINEL_API_TOKEN ?? "";
  const orgId = process.env.SENTINEL_ORG_ID ?? "default";
  const cacheDir = process.env.SENTINEL_CACHE_DIR ?? `${process.env.HOME ?? "/tmp"}/.sentinel/cache`;
  const projectId = process.env.SENTINEL_PROJECT_ID ?? "default";

  const apiClient = new SentinelApiClient(apiUrl, apiToken, orgId);
  const findingCache = new FindingCache();

  const sseListener = new SseListener(
    apiUrl, apiToken, orgId,
    ["scan.*", "finding.*"],
    async (event) => {
      try {
        await server.handleSseEvent(event);
        for (const doc of documents.all()) {
          const diagnostics = server.getDiagnosticsForFile(doc.uri);
          connection.sendDiagnostics({ uri: doc.uri, diagnostics });
        }
      } catch {
        // SSE event handling failed — cached findings remain valid
      }
    },
  );

  const server = createSentinelLspServer({ apiClient, sseListener, findingCache });

  connection.onInitialize((params) => {
    const result = server.onInitialize(params);
    findingCache.load(cacheDir, projectId);
    const sendStatus = (status: ConnectionStatus) =>
      connection.sendNotification("sentinel/connectionStatus", { status });

    apiClient.getFindings().then((raw) => {
      const data = raw as { findings: SentinelFinding[]; total: number };
      findingCache.upsert(data.findings);
      for (const doc of documents.all()) {
        connection.sendDiagnostics({ uri: doc.uri, diagnostics: server.getDiagnosticsForFile(doc.uri) });
      }
      findingCache.save(cacheDir, projectId);
      sendStatus("connected");
    }).catch((err: Error) => {
      if (err.message?.includes("401") || err.message?.includes("403")) {
        sendStatus("auth_error");
      } else {
        sendStatus("offline");
      }
    });
    sseListener.connect();
    return result;
  });

  connection.onShutdown(() => {
    sseListener.disconnect();
    findingCache.save(cacheDir, projectId);
  });

  documents.onDidOpen((event: TextDocumentChangeEvent<TextDocument>) => {
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: server.getDiagnosticsForFile(event.document.uri) });
  });

  documents.onDidChangeContent((event: TextDocumentChangeEvent<TextDocument>) => {
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: server.getDiagnosticsForFile(event.document.uri) });
  });

  documents.onDidClose((event: TextDocumentChangeEvent<TextDocument>) => {
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
  });

  connection.onCodeAction((params) => server.getCodeActionsForFile(params.textDocument.uri, params.range));
  connection.onCodeLens((params) => server.getCodeLensesForFile(params.textDocument.uri));
  connection.onExecuteCommand(async (params) => { await server.handleCommand(params.command, params.arguments ?? []); });

  documents.listen(connection);
  connection.listen();
}
