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
  checkRuns: boolean;              // GitHub only
  commitStatus: boolean;           // All providers
  prComments: boolean;             // All providers
  prAnnotations: boolean;          // GitHub (via Check Run annotations)
  webhookSignatureVerification: boolean;
  appInstallations: boolean;       // GitHub Apps, GitLab Group Access Tokens
}

export interface VcsScanTrigger {
  provider: VcsProviderType;
  type: VcsTriggerType;
  installationId: string;          // string to support all providers
  repo: string;                    // "owner/repo" or "group/subgroup/project"
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

/** Core provider interface — every VCS integration implements this. */
export interface VcsProvider {
  readonly name: string;
  readonly type: VcsProviderType;
  readonly capabilities: VcsCapabilities;

  /** Verify incoming webhook signature/token */
  verifyWebhook(event: VcsWebhookEvent, secret: string): Promise<boolean>;

  /** Parse raw webhook into a VcsScanTrigger (or null if irrelevant) */
  parseWebhook(event: VcsWebhookEvent): Promise<VcsScanTrigger | null>;

  /** Fetch unified diff for a trigger */
  fetchDiff(trigger: VcsScanTrigger): Promise<VcsDiffResult>;

  /** Report scan results back to the VCS (status, comments, annotations) */
  reportStatus(
    trigger: VcsScanTrigger,
    report: VcsStatusReport,
  ): Promise<void>;

  /** Get an authenticated token/client for API calls */
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
