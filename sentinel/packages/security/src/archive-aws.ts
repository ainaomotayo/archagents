import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { ArchiveProvider } from "./archive-provider.js";

export class AwsArchiveProvider implements ArchiveProvider {
  private s3: S3Client;

  constructor(opts: { region?: string }) {
    this.s3 = new S3Client({ region: opts.region ?? "us-east-1" });
  }

  async upload(opts: {
    bucket: string;
    key: string;
    data: string;
    contentType: string;
    retentionDays: number;
  }) {
    const retainUntil = new Date();
    retainUntil.setUTCDate(retainUntil.getUTCDate() + opts.retentionDays);

    const result = await this.s3.send(
      new PutObjectCommand({
        Bucket: opts.bucket,
        Key: opts.key,
        Body: opts.data,
        ContentType: opts.contentType,
        ObjectLockMode: "COMPLIANCE",
        ObjectLockRetainUntilDate: retainUntil,
      }),
    );

    return {
      key: opts.key,
      bucket: opts.bucket,
      versionId: result.VersionId ?? "",
      retainUntil: retainUntil.toISOString(),
    };
  }
}
