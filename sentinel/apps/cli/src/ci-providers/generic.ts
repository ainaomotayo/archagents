import { execSync as nodeExecSync } from "node:child_process";
import type { CiEnvironment, CiProviderDetector, CiProviderName } from "./types.js";

type ExecFn = (command: string) => string;

function createGitRunner(execFn: ExecFn): (command: string) => string {
  return (command: string) => {
    try {
      return execFn(command).trim();
    } catch {
      return "unknown";
    }
  };
}

function defaultExec(command: string): string {
  return nodeExecSync(command, { encoding: "utf-8" });
}

export function parseRepoFromRemote(remoteUrl: string): string {
  if (remoteUrl === "unknown") return "unknown";

  // SSH: git@github.com:org/repo.git
  const sshMatch = remoteUrl.match(/:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];

  // HTTPS: https://github.com/org/repo.git
  try {
    const url = new URL(remoteUrl);
    const path = url.pathname.replace(/^\//, "").replace(/\.git$/, "");
    return path || "unknown";
  } catch {
    return "unknown";
  }
}

export class GenericDetector implements CiProviderDetector {
  readonly name: CiProviderName = "generic";
  readonly priority = 99;

  private execFn: ExecFn;

  constructor(execFn?: ExecFn) {
    this.execFn = execFn ?? defaultExec;
  }

  canDetect(): boolean {
    return true;
  }

  detect(): CiEnvironment {
    const git = createGitRunner(this.execFn);

    const commitSha = git("git rev-parse HEAD");
    const branch = git("git branch --show-current");
    const actor = git("git config user.name");
    const remoteUrl = git("git remote get-url origin");
    const repository = parseRepoFromRemote(remoteUrl);

    return {
      provider: "generic",
      commitSha,
      branch,
      actor,
      repository,
    };
  }
}
