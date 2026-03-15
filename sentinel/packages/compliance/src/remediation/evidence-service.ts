import { randomUUID } from "node:crypto";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/csv",
  "application/json",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export interface S3Presigner {
  getPresignedUploadUrl(
    key: string,
    contentType: string,
    maxSize: number,
  ): Promise<{ url: string; key: string }>;
  getPresignedDownloadUrl(key: string): Promise<string>;
}

export class EvidenceService {
  constructor(
    private db: any,
    private s3: S3Presigner,
  ) {}

  async requestUpload(
    orgId: string,
    remediationId: string,
    fileName: string,
    fileSize: number,
    mimeType: string,
    userId: string,
  ) {
    if (fileSize > MAX_FILE_SIZE) throw new Error("File exceeds 25MB limit");
    if (!ALLOWED_MIME_TYPES.has(mimeType))
      throw new Error(`File type ${mimeType} not allowed`);

    const item = await this.db.remediationItem.findUnique({
      where: { id: remediationId },
    });
    if (!item || item.orgId !== orgId)
      throw new Error("Remediation item not found");

    const s3Key = `evidence/${orgId}/${remediationId}/${randomUUID()}/${fileName}`;
    const { url } = await this.s3.getPresignedUploadUrl(
      s3Key,
      mimeType,
      fileSize,
    );

    return { uploadUrl: url, s3Key, expiresIn: 900 };
  }

  async confirmUpload(
    orgId: string,
    remediationId: string,
    s3Key: string,
    fileName: string,
    fileSize: number,
    mimeType: string,
    userId: string,
  ) {
    return this.db.evidenceAttachment.create({
      data: {
        orgId,
        remediationId,
        fileName,
        fileSize,
        mimeType,
        s3Key,
        uploadedBy: userId,
      },
    });
  }

  async list(orgId: string, remediationId: string) {
    return this.db.evidenceAttachment.findMany({
      where: { orgId, remediationId },
      orderBy: { createdAt: "desc" },
    });
  }

  async getDownloadUrl(orgId: string, evidenceId: string) {
    const evidence = await this.db.evidenceAttachment.findUnique({
      where: { id: evidenceId },
    });
    if (!evidence || evidence.orgId !== orgId)
      throw new Error("Evidence not found");
    return this.s3.getPresignedDownloadUrl(evidence.s3Key);
  }

  async delete(orgId: string, evidenceId: string) {
    const evidence = await this.db.evidenceAttachment.findUnique({
      where: { id: evidenceId },
    });
    if (!evidence || evidence.orgId !== orgId)
      throw new Error("Evidence not found");
    return this.db.evidenceAttachment.delete({ where: { id: evidenceId } });
  }
}
