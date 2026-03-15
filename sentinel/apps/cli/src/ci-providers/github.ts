import type { CiProviderDetector, CiProviderInfo } from "./types.js";

export class GitHubCiDetector implements CiProviderDetector {
  readonly name = "github";

  canDetect(): boolean {
    return process.env.GITHUB_ACTIONS === "true";
  }

  detect(): CiProviderInfo {
    const prRaw = process.env.GITHUB_EVENT_NAME === "pull_request"
      ? process.env.GITHUB_REF_NAME?.match(/^(\d+)\//)?.[1]
      : undefined;
    const prNumber = prRaw ? parseInt(prRaw, 10) : undefined;

    return {
      provider: "github",
      commitHash: process.env.GITHUB_SHA ?? "",
      branch: process.env.GITHUB_REF_NAME ?? "",
      author: process.env.GITHUB_ACTOR ?? "",
      prNumber: Number.isNaN(prNumber) ? undefined : prNumber,
      projectId: process.env.GITHUB_REPOSITORY ?? "",
      repositoryUrl: process.env.GITHUB_SERVER_URL
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`
        : undefined,
    };
  }
}
