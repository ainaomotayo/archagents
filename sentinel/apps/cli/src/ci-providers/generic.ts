import type { CiProviderDetector, CiProviderInfo } from "./types.js";

export class GenericCiDetector implements CiProviderDetector {
  readonly name = "generic";

  canDetect(): boolean {
    return true; // Always matches as fallback
  }

  detect(): CiProviderInfo {
    const prRaw = process.env.SENTINEL_PR_NUMBER;
    const prNumber = prRaw ? parseInt(prRaw, 10) : undefined;

    return {
      provider: "generic",
      commitHash: process.env.SENTINEL_COMMIT ?? "",
      branch: process.env.SENTINEL_BRANCH ?? "",
      author: process.env.SENTINEL_AUTHOR ?? "",
      prNumber: Number.isNaN(prNumber) ? undefined : prNumber,
      projectId: process.env.SENTINEL_PROJECT ?? "",
      repositoryUrl: process.env.SENTINEL_REPO_URL,
    };
  }
}
