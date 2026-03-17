export type CiProviderName = "github" | "gitlab" | "azure_devops" | "generic";

export interface CiEnvironment {
  provider: CiProviderName;
  commitSha: string;
  branch: string;
  baseBranch?: string;
  actor: string;
  repository: string;
  mergeRequestId?: string;
  pipelineId?: string;
  pipelineUrl?: string;
  projectId?: string;
  serverUrl?: string;
}

export interface CiProviderDetector {
  readonly name: CiProviderName;
  readonly priority: number;
  canDetect(): boolean;
  detect(): CiEnvironment;
}
