import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GitLabDetector } from "../gitlab.js";

describe("GitLabDetector", () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    delete process.env.GITLAB_CI;
    delete process.env.CI_COMMIT_SHA;
    delete process.env.CI_COMMIT_REF_NAME;
    delete process.env.GITLAB_USER_LOGIN;
    delete process.env.CI_PROJECT_PATH;
    delete process.env.CI_MERGE_REQUEST_IID;
    delete process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME;
    delete process.env.CI_PIPELINE_ID;
    delete process.env.CI_PIPELINE_URL;
    delete process.env.CI_PROJECT_ID;
    delete process.env.CI_SERVER_URL;
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it("has name='gitlab' and priority=20", () => {
    const detector = new GitLabDetector();
    expect(detector.name).toBe("gitlab");
    expect(detector.priority).toBe(20);
  });

  it("canDetect returns true when GITLAB_CI is set", () => {
    process.env.GITLAB_CI = "true";
    const detector = new GitLabDetector();
    expect(detector.canDetect()).toBe(true);
  });

  it("canDetect returns false when GITLAB_CI is not set", () => {
    const detector = new GitLabDetector();
    expect(detector.canDetect()).toBe(false);
  });

  it("detect extracts full MR context", () => {
    process.env.GITLAB_CI = "true";
    process.env.CI_COMMIT_SHA = "def456";
    process.env.CI_COMMIT_REF_NAME = "feature/mr-test";
    process.env.GITLAB_USER_LOGIN = "gluser";
    process.env.CI_PROJECT_PATH = "group/project";
    process.env.CI_MERGE_REQUEST_IID = "42";
    process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME = "main";
    process.env.CI_PIPELINE_ID = "99999";
    process.env.CI_PIPELINE_URL = "https://gitlab.com/group/project/-/pipelines/99999";
    process.env.CI_PROJECT_ID = "12345";
    process.env.CI_SERVER_URL = "https://gitlab.com";

    const detector = new GitLabDetector();
    const env = detector.detect();

    expect(env).toEqual({
      provider: "gitlab",
      commitSha: "def456",
      branch: "feature/mr-test",
      baseBranch: "main",
      actor: "gluser",
      repository: "group/project",
      mergeRequestId: "42",
      pipelineId: "99999",
      pipelineUrl: "https://gitlab.com/group/project/-/pipelines/99999",
      projectId: "12345",
      serverUrl: "https://gitlab.com",
    });
  });

  it("detect handles push context (no MR vars)", () => {
    process.env.GITLAB_CI = "true";
    process.env.CI_COMMIT_SHA = "def456";
    process.env.CI_COMMIT_REF_NAME = "main";
    process.env.GITLAB_USER_LOGIN = "gluser";
    process.env.CI_PROJECT_PATH = "group/project";
    process.env.CI_PIPELINE_ID = "99999";
    process.env.CI_PIPELINE_URL = "https://gitlab.com/group/project/-/pipelines/99999";
    process.env.CI_PROJECT_ID = "12345";
    process.env.CI_SERVER_URL = "https://gitlab.com";

    const detector = new GitLabDetector();
    const env = detector.detect();

    expect(env.baseBranch).toBeUndefined();
    expect(env.mergeRequestId).toBeUndefined();
    expect(env.branch).toBe("main");
  });

  it("detect throws when CI_COMMIT_SHA is missing", () => {
    process.env.GITLAB_CI = "true";
    process.env.CI_PROJECT_PATH = "group/project";

    const detector = new GitLabDetector();
    expect(() => detector.detect()).toThrow("CI_COMMIT_SHA");
  });

  it("detect throws when CI_PROJECT_PATH is missing", () => {
    process.env.GITLAB_CI = "true";
    process.env.CI_COMMIT_SHA = "def456";

    const detector = new GitLabDetector();
    expect(() => detector.detect()).toThrow("CI_PROJECT_PATH");
  });
});
