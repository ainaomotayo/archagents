import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ReportStorage } from "./storage.js";

export interface S3StorageConfig {
  bucket: string;
  region?: string;
}

export class S3ReportStorage implements ReportStorage {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({ region: config.region ?? "us-east-1" });
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AWS SDK type mismatch between @smithy/types versions
    return (getSignedUrl as any)(this.client, new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }), { expiresIn: expiresInSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }
}
