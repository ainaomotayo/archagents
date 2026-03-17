import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GitHubDetector } from "../github.js";

describe("GitHubDetector", () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITHUB_SHA;
    delete process.env.GITHUB_REF_NAME;
    delete process.env.GITHUB_ACTOR;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_BASE_REF;
    delete process.env.GITHUB_RUN_ID;
    delete process.env.GITHUB_SERVER_URL;
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it("has name='github' and priority=10", () => {
    const detector = new GitHubDetector();
    expect(detector.name).toBe("github");
    expect(detector.priority).toBe(10);
  });

  it("canDetect returns true when GITHUB_ACTIONS is set", () => {
    process.env.GITHUB_ACTIONS = "true";
    const detector = new GitHubDetector();
    expect(detector.canDetect()).toBe(true);
  });

  it("canDetect returns false when GITHUB_ACTIONS is not set", () => {
    const detector = new GitHubDetector();
    expect(detector.canDetect()).toBe(false);
  });

  it("detect extracts full PR context", () => {
    process.env.GITHUB_ACTIONS = "true";
    process.env.GITHUB_SHA = "abc123";
    process.env.GITHUB_REF_NAME = "feature/test";
    process.env.GITHUB_ACTOR = "testuser";
    process.env.GITHUB_REPOSITORY = "org/repo";
    process.env.GITHUB_BASE_REF = "main";
    process.env.GITHUB_RUN_ID = "12345";
    process.env.GITHUB_SERVER_URL = "https://github.com";

    const detector = new GitHubDetector();
    const env = detector.detect();

    expect(env).toEqual({
      provider: "github",
      commitSha: "abc123",
      branch: "feature/test",
      baseBranch: "main",
      actor: "testuser",
      repository: "org/repo",
      pipelineId: "12345",
      pipelineUrl: "https://github.com/org/repo/actions/runs/12345",
      serverUrl: "https://github.com",
    });
  });

  it("detect handles push context (no base ref)", () => {
    process.env.GITHUB_ACTIONS = "true";
    process.env.GITHUB_SHA = "abc123";
    process.env.GITHUB_REF_NAME = "main";
    process.env.GITHUB_ACTOR = "testuser";
    process.env.GITHUB_REPOSITORY = "org/repo";
    process.env.GITHUB_RUN_ID = "12345";
    process.env.GITHUB_SERVER_URL = "https://github.com";

    const detector = new GitHubDetector();
    const env = detector.detect();

    expect(env.baseBranch).toBeUndefined();
    expect(env.branch).toBe("main");
  });

  it("detect throws when GITHUB_SHA is missing", () => {
    process.env.GITHUB_ACTIONS = "true";
    process.env.GITHUB_REPOSITORY = "org/repo";

    const detector = new GitHubDetector();
    expect(() => detector.detect()).toThrow("GITHUB_SHA");
  });

  it("detect throws when GITHUB_REPOSITORY is missing", () => {
    process.env.GITHUB_ACTIONS = "true";
    process.env.GITHUB_SHA = "abc123";

    const detector = new GitHubDetector();
    expect(() => detector.detect()).toThrow("GITHUB_REPOSITORY");
  });
});
