import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GitHubCiDetector } from "../github.js";

describe("GitHubCiDetector", () => {
  const detector = new GitHubCiDetector();

  beforeEach(() => {
    vi.stubEnv("GITHUB_ACTIONS", "true");
    vi.stubEnv("GITHUB_SHA", "abc123def");
    vi.stubEnv("GITHUB_REF_NAME", "feature/my-branch");
    vi.stubEnv("GITHUB_ACTOR", "octocat");
    vi.stubEnv("GITHUB_REPOSITORY", "my-org/my-repo");
    vi.stubEnv("GITHUB_SERVER_URL", "https://github.com");
    vi.stubEnv("GITHUB_EVENT_NAME", "push");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("canDetect", () => {
    it("returns true when GITHUB_ACTIONS is true", () => {
      expect(detector.canDetect()).toBe(true);
    });

    it("returns false when GITHUB_ACTIONS is not set", () => {
      vi.stubEnv("GITHUB_ACTIONS", "");
      expect(detector.canDetect()).toBe(false);
    });
  });

  describe("detect", () => {
    it("maps environment variables correctly for push", () => {
      const info = detector.detect();
      expect(info).toEqual({
        provider: "github",
        commitHash: "abc123def",
        branch: "feature/my-branch",
        author: "octocat",
        prNumber: undefined,
        projectId: "my-org/my-repo",
        repositoryUrl: "https://github.com/my-org/my-repo",
      });
    });

    it("parses PR number from ref name for pull_request events", () => {
      vi.stubEnv("GITHUB_EVENT_NAME", "pull_request");
      vi.stubEnv("GITHUB_REF_NAME", "42/merge");
      expect(detector.detect().prNumber).toBe(42);
    });

    it("returns undefined prNumber for push events", () => {
      expect(detector.detect().prNumber).toBeUndefined();
    });

    it("constructs repositoryUrl from server URL and repository", () => {
      const info = detector.detect();
      expect(info.repositoryUrl).toBe("https://github.com/my-org/my-repo");
    });

    it("returns undefined repositoryUrl when server URL missing", () => {
      vi.stubEnv("GITHUB_SERVER_URL", "");
      expect(detector.detect().repositoryUrl).toBeUndefined();
    });

    it("handles missing env vars gracefully", () => {
      vi.unstubAllEnvs();
      const info = detector.detect();
      expect(info.commitHash).toBe("");
      expect(info.branch).toBe("");
      expect(info.author).toBe("");
      expect(info.projectId).toBe("");
    });
  });
});
