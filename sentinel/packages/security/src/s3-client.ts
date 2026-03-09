import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  buildArchiveKey,
  buildPutObjectParams,
  type ArchiveConfig,
  type ArchiveResult,
} from "./s3-archive.js";

let s3: S3Client | undefined;

export function getS3Client(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
    });
  }
  return s3;
}

export async function archiveToS3(
  config: ArchiveConfig,
  orgId: string,
  documentId: string,
  data: string,
): Promise<ArchiveResult> {
  const key = buildArchiveKey(orgId, documentId);
  const params = buildPutObjectParams(config, key, data) as any;
  const client = getS3Client();

  const result = await client.send(new PutObjectCommand(params));

  return {
    key: params.Key,
    bucket: params.Bucket,
    versionId: result.VersionId ?? "",
    retainUntil: params.ObjectLockRetainUntilDate,
  };
}

export function isArchiveEnabled(): boolean {
  return !!process.env.S3_ARCHIVE_BUCKET;
}

export function getArchiveConfig(): ArchiveConfig {
  return {
    bucket: process.env.S3_ARCHIVE_BUCKET ?? "",
    prefix: process.env.S3_ARCHIVE_PREFIX ?? "sentinel",
    retentionDays: parseInt(process.env.S3_RETENTION_DAYS ?? "2555", 10),
  };
}
