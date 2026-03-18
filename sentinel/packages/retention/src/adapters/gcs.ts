import { S3Adapter } from "./s3.js";
import type { ArchiveConfig, ArchivePayload, ArchiveResult, ArchivePort } from "../ports/archive-port.js";

export class GCSAdapter implements ArchivePort {
  readonly type = "gcs";
  private s3 = new S3Adapter();

  private toS3Config(config: ArchiveConfig): ArchiveConfig {
    return { ...config, config: { ...config.config, endpoint: "https://storage.googleapis.com", region: "auto" } };
  }

  async testConnection(config: ArchiveConfig): Promise<{ ok: boolean; error?: string }> {
    return this.s3.testConnection(this.toS3Config(config));
  }

  async archive(payload: ArchivePayload, config: ArchiveConfig): Promise<ArchiveResult> {
    const result = await this.s3.archive(payload, this.toS3Config(config));
    if (result.success) { result.destination = result.destination.replace("s3://", "gs://"); }
    return result;
  }
}
