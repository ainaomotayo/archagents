import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import type { ArchiveProvider } from "./archive-provider.js";

export class AzureArchiveProvider implements ArchiveProvider {
  private client: BlobServiceClient;

  constructor(opts: { accountUrl: string }) {
    this.client = new BlobServiceClient(
      opts.accountUrl,
      new DefaultAzureCredential(),
    );
  }

  async upload(opts: {
    bucket: string;
    key: string;
    data: string;
    contentType: string;
    retentionDays: number;
  }) {
    const container = this.client.getContainerClient(opts.bucket);
    const blob = container.getBlockBlobClient(opts.key);

    const retainUntil = new Date();
    retainUntil.setUTCDate(retainUntil.getUTCDate() + opts.retentionDays);

    const uploadResult = await blob.upload(opts.data, opts.data.length, {
      blobHTTPHeaders: { blobContentType: opts.contentType },
      immutabilityPolicy: {
        expiriesOn: retainUntil,
        policyMode: "Locked",
      },
    });

    return {
      key: opts.key,
      bucket: opts.bucket,
      versionId: uploadResult.versionId ?? "",
      retainUntil: retainUntil.toISOString(),
    };
  }
}
