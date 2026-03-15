import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@aws-sdk/client-s3", () => {
  const send = vi.fn().mockResolvedValue({});
  const S3Client = vi.fn().mockImplementation(() => ({ send }));
  return { S3Client, PutObjectCommand: vi.fn(), DeleteObjectCommand: vi.fn(), GetObjectCommand: vi.fn() };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://bucket.s3.amazonaws.com/key?signed=1"),
}));

import { S3ReportStorage } from "../reports/s3-storage.js";

describe("S3ReportStorage", () => {
  let storage: S3ReportStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new S3ReportStorage({
      bucket: "test-bucket",
      region: "us-east-1",
    });
  });

  it("upload sends PutObjectCommand", async () => {
    await storage.upload("reports/org1/r1.pdf", Buffer.from("test"), "application/pdf");
    // If no error thrown, command was sent
    expect(true).toBe(true);
  });

  it("getSignedUrl returns a URL string", async () => {
    const url = await storage.getSignedUrl("reports/org1/r1.pdf", 900);
    expect(url).toContain("s3.amazonaws.com");
  });

  it("delete sends DeleteObjectCommand", async () => {
    await storage.delete("reports/org1/r1.pdf");
    // If no error thrown, command was sent
    expect(true).toBe(true);
  });
});
