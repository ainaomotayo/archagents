import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GitLabCiDetector } from "../gitlab.js";

describe("GitLabCiDetector", () => {
  const detector = new GitLabCiDetector();

  beforeEach(() => {
    vi.stubEnv("GITLAB_CI", "true");
    vi.stubEnv("CI_COMMIT_SHA", "abc123def");
    vi.stubEnv("CI_COMMIT_BRANCH", "feature/my-branch");
    vi.stubEnv("GITLAB_USER_NAME", "Jane Dev");
    vi.stubEnv("CI_PROJECT_PATH", "my-group/my-project");
    vi.stubEnv("CI_PROJECT_URL", "https://gitlab.com/my-group/my-project");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("canDetect", () => {
    it("returns true when GITLAB_CI is true", () => {
      expect(detector.canDetect()).toBe(true);
    });

    it("returns false when GITLAB_CI is not set", () => {
      vi.stubEnv("GITLAB_CI", "");
      expect(detector.canDetect()).toBe(false);
    });
  });

  describe("detect", () => {
    it("maps environment variables correctly", () => {
      const info = detector.detect();
      expect(info).toEqual({
        provider: "gitlab",
        commitHash: "abc123def",
        branch: "feature/my-branch",
        author: "Jane Dev",
        prNumber: undefined,
        projectId: "my-group/my-project",
        repositoryUrl: "https://gitlab.com/my-group/my-project",
      });
    });

    it("parses MR IID when present", () => {
      vi.stubEnv("CI_MERGE_REQUEST_IID", "99");
      expect(detector.detect().prNumber).toBe(99);
    });

    it("falls back to MR source branch when CI_COMMIT_BRANCH is empty", () => {
      vi.stubEnv("CI_COMMIT_BRANCH", "");
      vi.stubEnv("CI_MERGE_REQUEST_SOURCE_BRANCH_NAME", "mr-branch");
      expect(detector.detect().branch).toBe("mr-branch");
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
