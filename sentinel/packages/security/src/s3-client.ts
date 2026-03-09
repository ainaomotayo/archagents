import {
  buildArchiveKey,
  type ArchiveConfig,
  type ArchiveResult,
} from "./s3-archive.js";
import type { ArchiveProvider } from "./archive-provider.js";
import { createArchiveProvider, getCloudProvider } from "./cloud-factory.js";

let provider: ArchiveProvider | null | undefined;

async function getProvider(): Promise<ArchiveProvider | null> {
  if (provider === undefined) {
    provider = await createArchiveProvider();
  }
  return provider;
}

export async function archiveToS3(
  config: ArchiveConfig,
  orgId: string,
  documentId: string,
  data: string,
): Promise<ArchiveResult> {
  const p = await getProvider();
  if (!p) {
    throw new Error("No cloud provider configured. Set CLOUD_PROVIDER env var.");
  }

  const key = `${config.prefix}/${buildArchiveKey(orgId, documentId)}`;

  return p.upload({
    bucket: config.bucket,
    key,
    data,
    contentType: "application/json",
    retentionDays: config.retentionDays,
  });
}

export function isArchiveEnabled(): boolean {
  return getCloudProvider() !== null && !!(
    process.env.ARCHIVE_BUCKET ||
    process.env.S3_ARCHIVE_BUCKET ||
    process.env.GCS_ARCHIVE_BUCKET ||
    process.env.AZURE_ARCHIVE_CONTAINER
  );
}

export function getArchiveConfig(): ArchiveConfig {
  return {
    bucket:
      process.env.ARCHIVE_BUCKET ??
      process.env.S3_ARCHIVE_BUCKET ??
      process.env.GCS_ARCHIVE_BUCKET ??
      process.env.AZURE_ARCHIVE_CONTAINER ??
      "",
    prefix: process.env.ARCHIVE_PREFIX ?? process.env.S3_ARCHIVE_PREFIX ?? "sentinel",
    retentionDays: parseInt(
      process.env.ARCHIVE_RETENTION_DAYS ?? process.env.S3_RETENTION_DAYS ?? "2555",
      10,
    ),
  };
}
