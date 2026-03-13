import { describe, it, expect, vi, beforeEach } from "vitest";
import { EvidenceService } from "../remediation/evidence-service.js";

describe("EvidenceService", () => {
  let service: EvidenceService;
  let mockDb: any;
  let mockS3: any;

  beforeEach(() => {
    mockDb = {
      evidenceAttachment: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
      remediationItem: { findUnique: vi.fn() },
    };
    mockS3 = {
      getPresignedUploadUrl: vi.fn(),
      getPresignedDownloadUrl: vi.fn(),
    };
    service = new EvidenceService(mockDb, mockS3);
  });

  it("rejects files larger than 25MB", async () => {
    await expect(
      service.requestUpload(
        "org-1",
        "rem-1",
        "huge.pdf",
        26 * 1024 * 1024,
        "application/pdf",
        "user-1",
      ),
    ).rejects.toThrow("25MB");
  });

  it("rejects disallowed MIME types", async () => {
    await expect(
      service.requestUpload(
        "org-1",
        "rem-1",
        "malware.exe",
        1024,
        "application/x-executable",
        "user-1",
      ),
    ).rejects.toThrow("not allowed");
  });

  it("generates presigned upload URL for valid file", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({
      id: "rem-1",
      orgId: "org-1",
    });
    mockS3.getPresignedUploadUrl.mockResolvedValue({
      url: "https://s3.example.com/upload",
      key: "evidence/org-1/rem-1/uuid/test.pdf",
    });

    const result = await service.requestUpload(
      "org-1",
      "rem-1",
      "test.pdf",
      1024,
      "application/pdf",
      "user-1",
    );
    expect(result).toHaveProperty("uploadUrl");
    expect(result).toHaveProperty("s3Key");
    expect(result.expiresIn).toBe(900);
  });

  it("confirms upload and creates DB record", async () => {
    mockDb.evidenceAttachment.create.mockResolvedValue({
      id: "ev-1",
      fileName: "test.pdf",
    });

    const result = await service.confirmUpload(
      "org-1",
      "rem-1",
      "evidence/org-1/rem-1/uuid/test.pdf",
      "test.pdf",
      1024,
      "application/pdf",
      "user-1",
    );
    expect(result).toHaveProperty("id");
  });

  it("lists evidence for a remediation item", async () => {
    mockDb.evidenceAttachment.findMany.mockResolvedValue([{ id: "ev-1" }]);
    const result = await service.list("org-1", "rem-1");
    expect(result).toHaveLength(1);
  });

  it("generates presigned download URL", async () => {
    mockDb.evidenceAttachment.findUnique.mockResolvedValue({
      id: "ev-1",
      orgId: "org-1",
      s3Key: "evidence/key",
    });
    mockS3.getPresignedDownloadUrl.mockResolvedValue(
      "https://s3.example.com/download",
    );

    const result = await service.getDownloadUrl("org-1", "ev-1");
    expect(result).toContain("https://");
  });

  it("rejects download for evidence belonging to different org", async () => {
    mockDb.evidenceAttachment.findUnique.mockResolvedValue({
      id: "ev-1",
      orgId: "org-other",
      s3Key: "evidence/key",
    });

    await expect(
      service.getDownloadUrl("org-1", "ev-1"),
    ).rejects.toThrow("Evidence not found");
  });

  it("deletes evidence attachment", async () => {
    mockDb.evidenceAttachment.findUnique.mockResolvedValue({
      id: "ev-1",
      orgId: "org-1",
    });
    mockDb.evidenceAttachment.delete.mockResolvedValue({ id: "ev-1" });

    const result = await service.delete("org-1", "ev-1");
    expect(result).toHaveProperty("id");
    expect(mockDb.evidenceAttachment.delete).toHaveBeenCalledWith({
      where: { id: "ev-1" },
    });
  });
});
