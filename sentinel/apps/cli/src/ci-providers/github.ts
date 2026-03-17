import type { CiEnvironment, CiProviderDetector, CiProviderName } from "./types.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

export class GitHubDetector implements CiProviderDetector {
  readonly name: CiProviderName = "github";
  readonly priority = 10;

  canDetect(): boolean {
    return !!process.env.GITHUB_ACTIONS;
  }

  detect(): CiEnvironment {
    const commitSha = requireEnv("GITHUB_SHA");
    const repository = requireEnv("GITHUB_REPOSITORY");
    const branch = process.env.GITHUB_REF_NAME ?? "";
    const actor = process.env.GITHUB_ACTOR ?? "unknown";
    const baseRef = process.env.GITHUB_BASE_REF || undefined;
    const runId = process.env.GITHUB_RUN_ID;
    const serverUrl = process.env.GITHUB_SERVER_URL ?? "https://github.com";

    const env: CiEnvironment = {
      provider: "github",
      commitSha,
      branch,
      actor,
      repository,
      serverUrl,
    };

    if (baseRef) {
      env.baseBranch = baseRef;
    }

    if (runId) {
      env.pipelineId = runId;
      env.pipelineUrl = `${serverUrl}/${repository}/actions/runs/${runId}`;
    }

    return env;
  }
}
