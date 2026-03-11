import * as path from "node:path";
import * as vscode from "vscode";
import {
  LanguageClient,
  TransportKind,
  type ServerOptions,
  type LanguageClientOptions,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Resolve the sentinel-lsp server module
  const serverModule = path.resolve(__dirname, "..", "..", "sentinel-lsp", "dist", "index.js");

  const config = vscode.workspace.getConfiguration("sentinel");
  const apiUrl = config.get<string>("apiUrl", "http://localhost:8080");
  const orgId = config.get<string>("orgId", "default");
  const projectId = config.get<string>("projectId", "");
  const apiToken = await context.secrets.get("sentinel.apiToken") ?? "";

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        env: {
          ...process.env,
          SENTINEL_API_URL: apiUrl,
          SENTINEL_API_TOKEN: apiToken,
          SENTINEL_ORG_ID: orgId,
          SENTINEL_PROJECT_ID: projectId,
        },
      },
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        env: {
          ...process.env,
          SENTINEL_API_URL: apiUrl,
          SENTINEL_API_TOKEN: apiToken,
          SENTINEL_ORG_ID: orgId,
          SENTINEL_PROJECT_ID: projectId,
        },
        execArgv: ["--nolazy", "--inspect=6009"],
      },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", pattern: "**/*" }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*"),
    },
  };

  client = new LanguageClient(
    "sentinel",
    "Sentinel Security",
    serverOptions,
    clientOptions,
  );

  // Status bar item
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = "$(shield) Sentinel";
  statusBar.tooltip = "Sentinel Security";
  statusBar.command = "sentinel.openDashboard";
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("sentinel.configure", async () => {
      const token = await vscode.window.showInputBox({
        prompt: "Enter your Sentinel API token",
        password: true,
        placeHolder: "API token",
      });
      if (token !== undefined) {
        await context.secrets.store("sentinel.apiToken", token);
        vscode.window.showInformationMessage("Sentinel API token saved. Restart the extension to apply.");
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sentinel.openDashboard", () => {
      const dashboardUrl = apiUrl.replace(/:\d+$/, ":3000");
      vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sentinel.triggerScan", async () => {
      if (client) {
        const scanProjectId = vscode.workspace.getConfiguration("sentinel").get<string>("projectId", "");
        await client.sendRequest("workspace/executeCommand", {
          command: "sentinel.triggerScan",
          arguments: [scanProjectId, []],
        });
        vscode.window.showInformationMessage("Sentinel scan triggered.");
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sentinel.refresh", async () => {
      if (client) {
        await client.sendRequest("workspace/executeCommand", {
          command: "sentinel.showFindings",
          arguments: [],
        });
        vscode.window.showInformationMessage("Sentinel findings refreshed.");
      }
    }),
  );

  // Listen for connection status notifications from the LSP server
  client.onNotification("sentinel/connectionStatus", (params: { status: string }) => {
    switch (params.status) {
      case "connected":
        statusBar.text = "$(shield) Sentinel";
        statusBar.tooltip = "Sentinel Security — Connected";
        statusBar.backgroundColor = undefined;
        break;
      case "offline":
        statusBar.text = "$(shield) Sentinel (offline)";
        statusBar.tooltip = "Sentinel Security — API unreachable, showing cached findings";
        statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
        break;
      case "auth_error":
        statusBar.text = "$(shield) Sentinel (auth error)";
        statusBar.tooltip = "Sentinel Security — Invalid API token. Run 'Sentinel: Configure API Token'";
        statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
        break;
    }
  });

  // Start the client
  await client.start();
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
    client = undefined;
  }
}
