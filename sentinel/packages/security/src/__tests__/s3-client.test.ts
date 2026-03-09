import { describe, it, expect, afterEach } from "vitest";
import { isArchiveEnabled, getArchiveConfig } from "../s3-client.js";

describe("s3-client", () => {
  afterEach(() => {
    delete process.env.S3_ARCHIVE_BUCKET;
    delete process.env.S3_ARCHIVE_PREFIX;
    delete process.env.S3_RETENTION_DAYS;
    delete process.env.ARCHIVE_BUCKET;
    delete process.env.ARCHIVE_PREFIX;
    delete process.env.ARCHIVE_RETENTION_DAYS;
    delete process.env.CLOUD_PROVIDER;
  });

  it("isArchiveEnabled returns false without env var", () => {
    delete process.env.S3_ARCHIVE_BUCKET;
    expect(isArchiveEnabled()).toBe(false);
  });

  it("isArchiveEnabled returns true with env var", () => {
    process.env.CLOUD_PROVIDER = "aws";
    process.env.S3_ARCHIVE_BUCKET = "my-bucket";
    expect(isArchiveEnabled()).toBe(true);
  });

  it("getArchiveConfig uses defaults", () => {
    const config = getArchiveConfig();
    expect(config.bucket).toBe("");
    expect(config.prefix).toBe("sentinel");
    expect(config.retentionDays).toBe(2555);
  });

  it("getArchiveConfig reads env vars", () => {
    process.env.S3_ARCHIVE_BUCKET = "my-bucket";
    process.env.S3_ARCHIVE_PREFIX = "custom";
    process.env.S3_RETENTION_DAYS = "365";
    const config = getArchiveConfig();
    expect(config.bucket).toBe("my-bucket");
    expect(config.prefix).toBe("custom");
    expect(config.retentionDays).toBe(365);
  });
});
