import { BlobServiceClient } from "@azure/storage-blob";
import type { ArchivePort, ArchivePayload, ArchiveConfig, ArchiveResult } from "../ports/archive-port.js";

export class AzureBlobAdapter implements ArchivePort {
  readonly type = "azure_blob";

  async testConnection(config: ArchiveConfig): Promise<{ ok: boolean; error?: string }> {
    try {
      const { container } = config.config as { container: string };
      const connStr = (config.credential as { connectionString: string }).connectionString;
      const client = BlobServiceClient.fromConnectionString(connStr).getContainerClient(container);
      await client.getProperties();
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async archive(payload: ArchivePayload, config: ArchiveConfig): Promise<ArchiveResult> {
    try {
      const { container } = config.config as { container: string };
      const connStr = (config.credential as { connectionString: string }).connectionString;
      const containerClient = BlobServiceClient.fromConnectionString(connStr).getContainerClient(container);
      const date = new Date().toISOString().split("T")[0];
      const blobName = `${payload.orgId}/${payload.dataType}/${payload.metadata.severity ?? "all"}/${date}.jsonl`;
      const body = payload.records.map((r) => JSON.stringify(r)).join("\n");
      const blockBlob = containerClient.getBlockBlobClient(blobName);
      await blockBlob.upload(body, Buffer.byteLength(body));
      return { success: true, recordCount: payload.records.length, destination: `azure://${container}/${blobName}` };
    } catch (err: unknown) {
      return { success: false, recordCount: 0, destination: "", error: err instanceof Error ? err.message : String(err) };
    }
  }
}
