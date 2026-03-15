import type { CiProviderDetector, CiProviderInfo } from "./types.js";

export class AzureDevOpsCiDetector implements CiProviderDetector {
  readonly name = "azure_devops";

  canDetect(): boolean {
    return process.env.TF_BUILD === "True";
  }

  detect(): CiProviderInfo {
    const rawBranch = process.env.BUILD_SOURCEBRANCH ?? "";
    const branch = rawBranch.replace(/^refs\/heads\//, "");

    const prRaw = process.env.SYSTEM_PULLREQUEST_PULLREQUESTID;
    const prNumber = prRaw ? parseInt(prRaw, 10) : undefined;

    return {
      provider: "azure_devops",
      commitHash: process.env.BUILD_SOURCEVERSION ?? "",
      branch,
      author: process.env.BUILD_REQUESTEDFOR ?? "",
      prNumber: Number.isNaN(prNumber) ? undefined : prNumber,
      projectId: process.env.BUILD_REPOSITORY_NAME ?? "",
      repositoryUrl: process.env.BUILD_REPOSITORY_URI,
    };
  }
}
