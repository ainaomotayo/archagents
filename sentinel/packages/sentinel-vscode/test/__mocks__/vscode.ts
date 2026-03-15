export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
export const ThemeIcon = class { constructor(public id: string) {} };
export const ThemeColor = class { constructor(public id: string) {} };
export const Uri = {
  file: (p: string) => ({ fsPath: p, scheme: "file", toString: () => `file://${p}` }),
  parse: (s: string) => ({ fsPath: s.replace("file://", ""), scheme: "file", toString: () => s }),
};
export const EventEmitter = class {
  event = () => {};
  fire() {}
  dispose() {}
};
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const workspace = {
  getConfiguration: () => ({
    get: (key: string, def: unknown) => def,
  }),
  onDidSaveTextDocument: () => ({ dispose: () => {} }),
  createFileSystemWatcher: () => ({ dispose: () => {} }),
};
export const window = {
  createStatusBarItem: () => ({
    text: "", tooltip: "", command: "", backgroundColor: undefined,
    show: () => {}, hide: () => {}, dispose: () => {},
  }),
  createTreeView: (_id: string, opts: Record<string, unknown>) => ({
    ...opts, badge: undefined, dispose: () => {},
  }),
  showInputBox: async () => undefined,
  showInformationMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  createWebviewPanel: () => ({
    webview: { html: "", onDidReceiveMessage: () => ({ dispose: () => {} }), asWebviewUri: (u: unknown) => u, cspSource: "" },
    onDidDispose: () => ({ dispose: () => {} }),
    reveal: () => {},
    dispose: () => {},
  }),
};
export const commands = {
  registerCommand: (_cmd: string, _cb: (...args: unknown[]) => unknown) => ({ dispose: () => {} }),
  executeCommand: async () => undefined,
};
export const env = {
  openExternal: async () => true,
};
export const ViewColumn = { One: 1, Two: 2, Beside: -2 };
export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };
export const MarkdownString = class {
  value = "";
  constructor(v?: string) { this.value = v ?? ""; }
  appendMarkdown(s: string) { this.value += s; return this; }
};
