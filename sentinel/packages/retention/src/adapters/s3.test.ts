import { describe, it, expect, vi } from "vitest";
import { S3Adapter } from "./s3.js";
import type { ArchivePayload, ArchiveConfig } from "../ports/archive-port.js";

vi.mock("@aws-sdk/client-s3", () => {
  const send = vi.fn().mockResolvedValue({});
  const S3Client = vi.fn().mockImplementation(() => ({ send, destroy: vi.fn() }));
  const PutObjectCommand = vi.fn().mockImplementation((input) => ({ input }));
  const HeadBucketCommand = vi.fn().mockImplementation((input) => ({ input }));
  return { S3Client, PutObjectCommand, HeadBucketCommand };
});

const adapter = new S3Adapter();
const config: ArchiveConfig = {
  type: "s3",
  config: { bucket: "my-bucket", region: "us-east-1", prefix: "archives" },
  credential: { accessKeyId: "AKIA...", secretAccessKey: "secret" },
};
const payload: ArchivePayload = {
  orgId: "org-1", executionId: "exec-1", dataType: "findings",
  records: [{ id: "f1", severity: "high" }],
  metadata: { severity: "high", cutoffDate: "2026-01-01", exportedAt: "2026-03-18" },
};

describe("S3Adapter", () => {
  it("has type 's3'", () => { expect(adapter.type).toBe("s3"); });

  it("archives records as JSONL to S3", async () => {
    const result = await adapter.archive(payload, config);
    expect(result.success).toBe(true);
    expect(result.recordCount).toBe(1);
    expect(result.destination).toContain("s3://my-bucket/archives/org-1/findings/high/");
  });

  it("testConnection calls HeadBucket", async () => {
    const result = await adapter.testConnection(config);
    expect(result.ok).toBe(true);
  });
});
