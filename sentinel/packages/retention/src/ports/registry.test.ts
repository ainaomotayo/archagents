import { describe, it, expect, beforeEach } from "vitest";
import { registerAdapter, getArchiveAdapter, listAdapterTypes } from "./registry.js";
import type { ArchivePort } from "./archive-port.js";

const mockAdapter: ArchivePort = {
  type: "mock",
  testConnection: async () => ({ ok: true }),
  archive: async (payload) => ({ success: true, recordCount: payload.records.length, destination: "mock://test" }),
};

describe("adapter registry", () => {
  it("registers and retrieves an adapter", () => {
    registerAdapter(mockAdapter);
    expect(getArchiveAdapter("mock")).toBe(mockAdapter);
  });

  it("throws for unknown adapter type", () => {
    expect(() => getArchiveAdapter("nonexistent")).toThrow("Unknown archive adapter: nonexistent");
  });

  it("lists registered types", () => {
    registerAdapter(mockAdapter);
    expect(listAdapterTypes()).toContain("mock");
  });
});
