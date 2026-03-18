import type { ArchivePort } from "./archive-port.js";

const adapters = new Map<string, ArchivePort>();

export function registerAdapter(adapter: ArchivePort): void {
  adapters.set(adapter.type, adapter);
}

export function getArchiveAdapter(type: string): ArchivePort {
  const adapter = adapters.get(type);
  if (!adapter) throw new Error(`Unknown archive adapter: ${type}`);
  return adapter;
}

export function listAdapterTypes(): string[] {
  return Array.from(adapters.keys());
}
