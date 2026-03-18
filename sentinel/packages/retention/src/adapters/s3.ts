import { S3Client, PutObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import type { ArchivePort, ArchivePayload, ArchiveConfig, ArchiveResult } from "../ports/archive-port.js";

export class S3Adapter implements ArchivePort {
  readonly type = "s3";

  private createClient(config: ArchiveConfig): S3Client {
    const { region, endpoint } = config.config as { region?: string; endpoint?: string };
    const cred = config.credential as { accessKeyId: string; secretAccessKey: string } | undefined;
    return new S3Client({
      region: region ?? "us-east-1",
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      ...(cred ? { credentials: { accessKeyId: cred.accessKeyId, secretAccessKey: cred.secretAccessKey } } : {}),
    });
  }

  buildKey(payload: ArchivePayload, config: ArchiveConfig): string {
    const { prefix } = config.config as { prefix?: string };
    const date = new Date().toISOString().split("T")[0];
    const parts = [prefix, payload.orgId, payload.dataType, payload.metadata.severity, `${date}.jsonl`].filter(Boolean);
    return parts.join("/");
  }

  async testConnection(config: ArchiveConfig): Promise<{ ok: boolean; error?: string }> {
    const client = this.createClient(config);
    try {
      const { bucket } = config.config as { bucket: string };
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      client.destroy();
    }
  }

  async archive(payload: ArchivePayload, config: ArchiveConfig): Promise<ArchiveResult> {
    const client = this.createClient(config);
    try {
      const { bucket } = config.config as { bucket: string };
      const key = this.buildKey(payload, config);
      const body = payload.records.map((r) => JSON.stringify(r)).join("\n");
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "application/x-ndjson" }));
      return { success: true, recordCount: payload.records.length, destination: `s3://${bucket}/${key}` };
    } catch (err: unknown) {
      return { success: false, recordCount: 0, destination: "", error: err instanceof Error ? err.message : String(err) };
    } finally {
      client.destroy();
    }
  }
}
