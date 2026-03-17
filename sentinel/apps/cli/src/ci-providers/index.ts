import { GitHubDetector } from "./github.js";
import { GitLabDetector } from "./gitlab.js";
import { AzureDevOpsDetector } from "./azure-devops.js";
import { GenericDetector } from "./generic.js";
import type { CiEnvironment, CiProviderDetector } from "./types.js";

export type { CiEnvironment, CiProviderDetector, CiProviderName } from "./types.js";

const detectors: CiProviderDetector[] = [
  new GitHubDetector(),
  new GitLabDetector(),
  new AzureDevOpsDetector(),
  new GenericDetector(),
].sort((a, b) => a.priority - b.priority);

export function detectCiEnvironment(): CiEnvironment {
  for (const detector of detectors) {
    if (detector.canDetect()) {
      return detector.detect();
    }
  }
  // GenericDetector always returns true, so this is unreachable
  throw new Error("No CI provider detected");
}
