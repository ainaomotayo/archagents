import type { CiEnvironment, CiProviderDetector, CiProviderName } from "./types.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

function stripRefsHeads(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
}

export class AzureDevOpsDetector implements CiProviderDetector {
  readonly name: CiProviderName = "azure_devops";
  readonly priority = 30;

  canDetect(): boolean {
    return !!process.env.TF_BUILD;
  }

  detect(): CiEnvironment {
    const commitSha = requireEnv("BUILD_SOURCEVERSION");
    const repository = requireEnv("BUILD_REPOSITORY_NAME");
    const branch = stripRefsHeads(process.env.BUILD_SOURCEBRANCH ?? "");
    const actor = process.env.BUILD_REQUESTEDFOR ?? "unknown";
    const targetBranch = process.env.SYSTEM_PULLREQUEST_TARGETBRANCH
      ? stripRefsHeads(process.env.SYSTEM_PULLREQUEST_TARGETBRANCH)
      : undefined;
    const prId = process.env.SYSTEM_PULLREQUEST_PULLREQUESTID || undefined;
    const buildId = process.env.BUILD_BUILDID || undefined;
    const collectionUri = process.env.SYSTEM_COLLECTIONURI;
    const teamProject = process.env.SYSTEM_TEAMPROJECT;

    const env: CiEnvironment = {
      provider: "azure_devops",
      commitSha,
      branch,
      actor,
      repository,
    };

    if (targetBranch) {
      env.baseBranch = targetBranch;
    }

    if (prId) {
      env.mergeRequestId = prId;
    }

    if (buildId) {
      env.pipelineId = buildId;
      if (collectionUri && teamProject) {
        env.pipelineUrl = `${collectionUri}${teamProject}/_build/results?buildId=${buildId}`;
      }
    }

    return env;
  }
}
