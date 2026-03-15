import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { detectCiProvider } from "../detect.js";

describe("detectCiProvider", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("detects Azure DevOps when TF_BUILD is True", () => {
    vi.stubEnv("TF_BUILD", "True");
    vi.stubEnv("BUILD_SOURCEVERSION", "azurecommit");
    const info = detectCiProvider();
    expect(info.provider).toBe("azure_devops");
    expect(info.commitHash).toBe("azurecommit");
  });

  it("detects GitHub when GITHUB_ACTIONS is true", () => {
    vi.stubEnv("GITHUB_ACTIONS", "true");
    vi.stubEnv("GITHUB_SHA", "ghcommit");
    const info = detectCiProvider();
    expect(info.provider).toBe("github");
    expect(info.commitHash).toBe("ghcommit");
  });

  it("detects GitLab when GITLAB_CI is true", () => {
    vi.stubEnv("GITLAB_CI", "true");
    vi.stubEnv("CI_COMMIT_SHA", "glcommit");
    const info = detectCiProvider();
    expect(info.provider).toBe("gitlab");
    expect(info.commitHash).toBe("glcommit");
  });

  it("falls back to generic when no CI detected", () => {
    vi.stubEnv("SENTINEL_COMMIT", "manualcommit");
    const info = detectCiProvider();
    expect(info.provider).toBe("generic");
    expect(info.commitHash).toBe("manualcommit");
  });

  it("respects SENTINEL_PROVIDER override", () => {
    vi.stubEnv("TF_BUILD", "True");
    vi.stubEnv("BUILD_SOURCEVERSION", "azurecommit");
    vi.stubEnv("SENTINEL_PROVIDER", "github");
    vi.stubEnv("GITHUB_SHA", "ghcommit");
    const info = detectCiProvider();
    expect(info.provider).toBe("github");
    expect(info.commitHash).toBe("ghcommit");
  });

  it("ignores invalid SENTINEL_PROVIDER override", () => {
    vi.stubEnv("SENTINEL_PROVIDER", "nonexistent");
    vi.stubEnv("GITHUB_ACTIONS", "true");
    vi.stubEnv("GITHUB_SHA", "ghcommit");
    const info = detectCiProvider();
    expect(info.provider).toBe("github");
  });

  it("prioritizes Azure DevOps over GitHub when both present", () => {
    vi.stubEnv("TF_BUILD", "True");
    vi.stubEnv("BUILD_SOURCEVERSION", "azurecommit");
    vi.stubEnv("GITHUB_ACTIONS", "true");
    vi.stubEnv("GITHUB_SHA", "ghcommit");
    const info = detectCiProvider();
    expect(info.provider).toBe("azure_devops");
  });
});
