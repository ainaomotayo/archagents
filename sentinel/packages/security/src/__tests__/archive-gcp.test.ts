import { describe, it, expect } from "vitest";
import { GcpArchiveProvider } from "../archive-gcp.js";

describe("GcpArchiveProvider", () => {
  it("implements ArchiveProvider interface", () => {
    const provider = new GcpArchiveProvider({ projectId: "test" });
    expect(provider.upload).toBeDefined();
    expect(typeof provider.upload).toBe("function");
  });
});
