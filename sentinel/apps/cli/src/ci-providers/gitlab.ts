import type { CiEnvironment, CiProviderDetector, CiProviderName } from "./types.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

export class GitLabDetector implements CiProviderDetector {
  readonly name: CiProviderName = "gitlab";
  readonly priority = 20;

  canDetect(): boolean {
    return !!process.env.GITLAB_CI;
  }

  detect(): CiEnvironment {
    const commitSha = requireEnv("CI_COMMIT_SHA");
    const repository = requireEnv("CI_PROJECT_PATH");
    const branch = process.env.CI_COMMIT_REF_NAME ?? "";
    const actor = process.env.GITLAB_USER_LOGIN ?? "unknown";
    const mrIid = process.env.CI_MERGE_REQUEST_IID || undefined;
    const targetBranch = process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME || undefined;
    const pipelineId = process.env.CI_PIPELINE_ID || undefined;
    const pipelineUrl = process.env.CI_PIPELINE_URL || undefined;
    const projectId = process.env.CI_PROJECT_ID || undefined;
    const serverUrl = process.env.CI_SERVER_URL || undefined;

    const env: CiEnvironment = {
      provider: "gitlab",
      commitSha,
      branch,
      actor,
      repository,
    };

    if (targetBranch) {
      env.baseBranch = targetBranch;
    }

    if (mrIid) {
      env.mergeRequestId = mrIid;
    }

    if (pipelineId) {
      env.pipelineId = pipelineId;
    }

    if (pipelineUrl) {
      env.pipelineUrl = pipelineUrl;
    }

    if (projectId) {
      env.projectId = projectId;
    }

    if (serverUrl) {
      env.serverUrl = serverUrl;
    }

    return env;
  }
}
