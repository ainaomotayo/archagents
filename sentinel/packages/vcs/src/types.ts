import type { AssessmentStatus } from "@sentinel/shared";

export type VcsProviderType =
  | "github"
  | "gitlab"
  | "bitbucket"
  | "azure_devops";

export type VcsTriggerType =
  | "push"
  | "pull_request"
  | "merge_request"
  | "tag_push";

export interface VcsCapabilities {
  checkRuns: boolean;
  commitStatus: boolean;
  prComments: boolean;
  prAnnotations: boolean;
  webhookSignatureVerification: boolean;
  appInstallations: boolean;
}

export interface VcsScanTrigger {
  provider: VcsProviderType;
  type: VcsTriggerType;
  installationId: string;
  repo: string;
  owner: string;
  commitHash: string;
  branch: string;
  author: string;
  prNumber?: number;
  projectId?: number;
  metadata?: Record<string, unknown>;
}

export interface VcsWebhookEvent {
  provider: VcsProviderType;
  headers: Record<string, string>;
  body: unknown;
  rawBody: string;
}

export interface VcsDiffResult {
  rawDiff: string;
  files: Array<{
    path: string;
    status: "added" | "modified" | "deleted" | "renamed";
  }>;
}

export interface VcsAnnotation {
  file: string;
  lineStart: number;
  lineEnd: number;
  level: "notice" | "warning" | "failure";
  title: string;
  message: string;
}

export interface VcsStatusReport {
  scanId: string;
  commitHash: string;
  status: AssessmentStatus;
  riskScore: number;
  summary: string;
  annotations: VcsAnnotation[];
  detailsUrl?: string;
}

export interface VcsProvider {
  readonly name: string;
  readonly type: VcsProviderType;
  readonly capabilities: VcsCapabilities;
  verifyWebhook(event: VcsWebhookEvent, secret: string): Promise<boolean>;
  parseWebhook(event: VcsWebhookEvent): Promise<VcsScanTrigger | null>;
  fetchDiff(trigger: VcsScanTrigger): Promise<VcsDiffResult>;
  reportStatus(
    trigger: VcsScanTrigger,
    report: VcsStatusReport,
  ): Promise<void>;
  getInstallationToken(installationId: string): Promise<string>;
}

export interface VcsProviderFactory {
  create(config: VcsProviderConfig): VcsProvider;
}

export interface VcsProviderConfig {
  type: VcsProviderType;
  credentials: Record<string, string>;
  options?: Record<string, unknown>;
}
