import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectCiEnvironment } from "../index.js";

describe("CI Provider Registry", () => {
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
    delete process.env.TF_BUILD;
    delete process.env.BUILD_SOURCEVERSION;
    delete process.env.BUILD_SOURCEBRANCH;
    delete process.env.BUILD_REQUESTEDFOR;
    delete process.env.BUILD_REPOSITORY_NAME;
    delete process.env.SYSTEM_PULLREQUEST_TARGETBRANCH;
    delete process.env.SYSTEM_PULLREQUEST_PULLREQUESTID;
    delete process.env.BUILD_BUILDID;
    delete process.env.SYSTEM_COLLECTIONURI;
    delete process.env.SYSTEM_TEAMPROJECT;
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it("detects GitHub when GITHUB_ACTIONS is set", () => {
    process.env.GITHUB_ACTIONS = "true";
    process.env.GITHUB_SHA = "sha1";
    process.env.GITHUB_REPOSITORY = "org/repo";

    const env = detectCiEnvironment();
    expect(env.provider).toBe("github");
    expect(env.commitSha).toBe("sha1");
  });

  it("detects GitLab when GITLAB_CI is set", () => {
    process.env.GITLAB_CI = "true";
    process.env.CI_COMMIT_SHA = "sha2";
    process.env.CI_PROJECT_PATH = "group/proj";

    const env = detectCiEnvironment();
    expect(env.provider).toBe("gitlab");
    expect(env.commitSha).toBe("sha2");
  });

  it("detects Azure DevOps when TF_BUILD is set", () => {
    process.env.TF_BUILD = "True";
    process.env.BUILD_SOURCEVERSION = "sha3";
    process.env.BUILD_REPOSITORY_NAME = "my-repo";

    const env = detectCiEnvironment();
    expect(env.provider).toBe("azure_devops");
    expect(env.commitSha).toBe("sha3");
  });

  it("falls back to generic when no CI env vars are set", () => {
    const env = detectCiEnvironment();
    expect(env.provider).toBe("generic");
  });

  it("GitHub wins over GitLab when both are set (lower priority)", () => {
    process.env.GITHUB_ACTIONS = "true";
    process.env.GITHUB_SHA = "gh-sha";
    process.env.GITHUB_REPOSITORY = "org/repo";
    process.env.GITLAB_CI = "true";
    process.env.CI_COMMIT_SHA = "gl-sha";
    process.env.CI_PROJECT_PATH = "group/proj";

    const env = detectCiEnvironment();
    expect(env.provider).toBe("github");
    expect(env.commitSha).toBe("gh-sha");
  });
});
