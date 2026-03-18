import { describe, it, expect, vi } from "vitest";
import { AzureBlobAdapter } from "./azure-blob.js";
import type { ArchivePayload, ArchiveConfig } from "../ports/archive-port.js";

vi.mock("@azure/storage-blob", () => {
  const uploadMock = vi.fn().mockResolvedValue({});
  const getPropertiesMock = vi.fn().mockResolvedValue({});
  const getBlockBlobClient = vi.fn().mockReturnValue({ upload: uploadMock });
  const getContainerClient = vi.fn().mockReturnValue({ getBlockBlobClient, getProperties: getPropertiesMock });
  const BlobServiceClient = { fromConnectionString: vi.fn().mockReturnValue({ getContainerClient }) };
  return { BlobServiceClient };
});

const adapter = new AzureBlobAdapter();
const config: ArchiveConfig = {
  type: "azure_blob",
  config: { container: "archives" },
  credential: { connectionString: "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=key;EndpointSuffix=core.windows.net" },
};
const payload: ArchivePayload = {
  orgId: "org-1", executionId: "exec-1", dataType: "findings",
  records: [{ id: "f1" }],
  metadata: { severity: "high", cutoffDate: "2026-01-01", exportedAt: "2026-03-18" },
};

describe("AzureBlobAdapter", () => {
  it("has type 'azure_blob'", () => { expect(adapter.type).toBe("azure_blob"); });
  it("archives records", async () => {
    const result = await adapter.archive(payload, config);
    expect(result.success).toBe(true);
    expect(result.recordCount).toBe(1);
  });
  it("testConnection checks container", async () => {
    const result = await adapter.testConnection(config);
    expect(result.ok).toBe(true);
  });
});
