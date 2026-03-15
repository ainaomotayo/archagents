export interface CiProviderInfo {
  provider: string;
  commitHash: string;
  branch: string;
  author: string;
  prNumber?: number;
  projectId: string;
  repositoryUrl?: string;
}

export interface CiProviderDetector {
  readonly name: string;
  canDetect(): boolean;
  detect(): CiProviderInfo;
}
