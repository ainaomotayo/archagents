export interface ArchiveConfig {
  type: string;
  config: Record<string, unknown>;
  credential?: Record<string, unknown>;
}

export interface ArchivePayload {
  orgId: string;
  executionId: string;
  dataType: "findings" | "agentResults" | "scans";
  records: Record<string, unknown>[];
  metadata: { severity?: string; cutoffDate: string; exportedAt: string };
}

export interface ArchiveResult {
  success: boolean;
  recordCount: number;
  destination: string;
  error?: string;
}

export interface ArchivePort {
  readonly type: string;
  testConnection(config: ArchiveConfig): Promise<{ ok: boolean; error?: string }>;
  archive(payload: ArchivePayload, config: ArchiveConfig): Promise<ArchiveResult>;
}
