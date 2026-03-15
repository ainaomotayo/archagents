import type { CiProviderDetector, CiProviderInfo } from "./types.js";

export class GitLabCiDetector implements CiProviderDetector {
  readonly name = "gitlab";

  canDetect(): boolean {
    return process.env.GITLAB_CI === "true";
  }

  detect(): CiProviderInfo {
    const prRaw = process.env.CI_MERGE_REQUEST_IID;
    const prNumber = prRaw ? parseInt(prRaw, 10) : undefined;

    return {
      provider: "gitlab",
      commitHash: process.env.CI_COMMIT_SHA ?? "",
      branch: process.env.CI_COMMIT_BRANCH || process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME || "",
      author: process.env.GITLAB_USER_NAME ?? "",
      prNumber: Number.isNaN(prNumber) ? undefined : prNumber,
      projectId: process.env.CI_PROJECT_PATH ?? "",
      repositoryUrl: process.env.CI_PROJECT_URL,
    };
  }
}
