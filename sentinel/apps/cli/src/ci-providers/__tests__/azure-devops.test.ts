import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AzureDevOpsCiDetector } from "../azure-devops.js";

describe("AzureDevOpsCiDetector", () => {
  const detector = new AzureDevOpsCiDetector();

  beforeEach(() => {
    vi.stubEnv("TF_BUILD", "True");
    vi.stubEnv("BUILD_SOURCEVERSION", "abc123def");
    vi.stubEnv("BUILD_SOURCEBRANCH", "refs/heads/feature/my-branch");
    vi.stubEnv("BUILD_REQUESTEDFOR", "Jane Dev");
    vi.stubEnv("BUILD_REPOSITORY_NAME", "my-org/my-repo");
    vi.stubEnv("BUILD_REPOSITORY_URI", "https://dev.azure.com/my-org/my-project/_git/my-repo");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("canDetect", () => {
    it("returns true when TF_BUILD is True", () => {
      expect(detector.canDetect()).toBe(true);
    });

    it("returns false when TF_BUILD is not set", () => {
      vi.stubEnv("TF_BUILD", "");
      expect(detector.canDetect()).toBe(false);
    });

    it("returns false when TF_BUILD is not True", () => {
      vi.stubEnv("TF_BUILD", "false");
      expect(detector.canDetect()).toBe(false);
    });
  });

  describe("detect", () => {
    it("maps environment variables correctly", () => {
      const info = detector.detect();
      expect(info).toEqual({
        provider: "azure_devops",
        commitHash: "abc123def",
        branch: "feature/my-branch",
        author: "Jane Dev",
        prNumber: undefined,
        projectId: "my-org/my-repo",
        repositoryUrl: "https://dev.azure.com/my-org/my-project/_git/my-repo",
      });
    });

    it("strips refs/heads/ prefix from branch", () => {
      vi.stubEnv("BUILD_SOURCEBRANCH", "refs/heads/main");
      expect(detector.detect().branch).toBe("main");
    });

    it("leaves branch without refs/heads/ prefix unchanged", () => {
      vi.stubEnv("BUILD_SOURCEBRANCH", "main");
      expect(detector.detect().branch).toBe("main");
    });

    it("parses PR number when present", () => {
      vi.stubEnv("SYSTEM_PULLREQUEST_PULLREQUESTID", "42");
      expect(detector.detect().prNumber).toBe(42);
    });

    it("returns undefined prNumber when not a PR", () => {
      expect(detector.detect().prNumber).toBeUndefined();
    });

    it("returns undefined prNumber for non-numeric value", () => {
      vi.stubEnv("SYSTEM_PULLREQUEST_PULLREQUESTID", "not-a-number");
      expect(detector.detect().prNumber).toBeUndefined();
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
