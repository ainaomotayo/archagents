import { vi } from "vitest";

export class ThemeColor {
  constructor(public id: string) {}
}

export class ThemeIcon {
  constructor(public id: string) {}
}

export class MarkdownString {
  value: string;
  constructor(value?: string) {
    this.value = value ?? "";
  }
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  label: string;
  collapsibleState: number;
  description?: string;
  tooltip?: any;
  iconPath?: any;
  contextValue?: string;
  command?: any;
  resourceUri?: any;
  constructor(label: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState ?? 0;
  }
}

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter((l) => l !== listener); } };
  };
  fire(data?: T): void {
    for (const l of this.listeners) l(data as T);
  }
  dispose(): void {
    this.listeners = [];
  }
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

function createMockStatusBarItem(): any {
  return {
    text: "",
    tooltip: "",
    command: undefined,
    backgroundColor: undefined,
    alignment: StatusBarAlignment.Left,
    priority: 0,
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  };
}

export const window = {
  createStatusBarItem: vi.fn((_alignment?: StatusBarAlignment, _priority?: number) => {
    const item = createMockStatusBarItem();
    item.alignment = _alignment ?? StatusBarAlignment.Left;
    item.priority = _priority ?? 0;
    return item;
  }),
  createOutputChannel: vi.fn(() => ({
    appendLine: vi.fn(),
    append: vi.fn(),
    clear: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  })),
  showInputBox: vi.fn(),
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  createTreeView: vi.fn((_viewId: string, _options: any) => ({
    dispose: vi.fn(),
    onDidChangeSelection: vi.fn(),
    onDidChangeVisibility: vi.fn(),
    reveal: vi.fn(),
  })),
  createTextEditorDecorationType: vi.fn(() => ({ dispose: vi.fn() })),
  onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: () => {} })),
  withProgress: async (_opts: any, task: any) => task({ report: () => {} }),
  activeTextEditor: undefined as any,
};

export const commands = {
  registerCommand: vi.fn(),
  executeCommand: vi.fn(),
};

export const env = {
  openExternal: vi.fn(),
};

export const workspace = {
  getConfiguration: vi.fn(() => ({
    get: vi.fn((_key: string, defaultValue: any) => defaultValue),
  })),
  createFileSystemWatcher: vi.fn(),
};

export class Range {
  constructor(
    public readonly startLine: number,
    public readonly startChar: number,
    public readonly endLine: number,
    public readonly endChar: number,
  ) {}
  get start() { return { line: this.startLine, character: this.startChar }; }
  get end() { return { line: this.endLine, character: this.endChar }; }
}

export const languages = {
  getDiagnostics: vi.fn(() => []),
  onDidChangeDiagnostics: vi.fn(() => ({ dispose: () => {} })),
};

export const Uri = {
  file: (path: string) => ({ scheme: "file", path }),
  parse: (value: string) => ({ scheme: "file", path: value }),
};

export class Position {
  constructor(public line: number, public character: number) {}
}

export class Selection {
  constructor(public anchor: any, public active: any) {}
}

export const ProgressLocation = { Notification: 15, SourceControl: 1, Window: 10 };

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
}
