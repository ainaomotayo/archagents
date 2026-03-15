import type { CiProviderDetector, CiProviderInfo } from "./types.js";
import { AzureDevOpsCiDetector } from "./azure-devops.js";
import { GitHubCiDetector } from "./github.js";
import { GitLabCiDetector } from "./gitlab.js";
import { GenericCiDetector } from "./generic.js";

const detectors: CiProviderDetector[] = [
  new AzureDevOpsCiDetector(),
  new GitHubCiDetector(),
  new GitLabCiDetector(),
  new GenericCiDetector(), // Always matches — must be last
];

export function detectCiProvider(): CiProviderInfo {
  // Allow explicit override
  const override = process.env.SENTINEL_PROVIDER;
  if (override) {
    const detector = detectors.find((d) => d.name === override);
    if (detector) {
      return detector.detect();
    }
  }

  for (const detector of detectors) {
    if (detector.canDetect()) {
      return detector.detect();
    }
  }

  // Unreachable — GenericCiDetector always matches
  return new GenericCiDetector().detect();
}
