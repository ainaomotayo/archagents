import { vi } from "vitest";

export class ThemeColor {
  constructor(public id: string) {}
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

export const Uri = {
  file: (path: string) => ({ scheme: "file", path }),
  parse: (value: string) => ({ scheme: "file", path: value }),
};
