export interface ArchiveProvider {
  upload(opts: {
    bucket: string;
    key: string;
    data: string;
    contentType: string;
    retentionDays: number;
  }): Promise<{ key: string; bucket: string; versionId: string; retainUntil: string }>;
}

export type CloudProvider = "aws" | "gcp" | "azure";
