import { describe, it, expect } from "vitest";
import { AzureArchiveProvider } from "../archive-azure.js";

describe("AzureArchiveProvider", () => {
  it("implements ArchiveProvider interface", () => {
    expect(AzureArchiveProvider).toBeDefined();
    expect(AzureArchiveProvider.prototype.upload).toBeDefined();
  });
});
