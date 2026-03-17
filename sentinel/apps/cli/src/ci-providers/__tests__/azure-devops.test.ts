import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AzureDevOpsDetector } from "../azure-devops.js";

describe("AzureDevOpsDetector", () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
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

  it("has name='azure_devops' and priority=30", () => {
    const detector = new AzureDevOpsDetector();
    expect(detector.name).toBe("azure_devops");
    expect(detector.priority).toBe(30);
  });

  it("canDetect returns true when TF_BUILD is set", () => {
    process.env.TF_BUILD = "True";
    const detector = new AzureDevOpsDetector();
    expect(detector.canDetect()).toBe(true);
  });

  it("canDetect returns false when TF_BUILD is not set", () => {
    const detector = new AzureDevOpsDetector();
    expect(detector.canDetect()).toBe(false);
  });

  it("detect extracts full PR context", () => {
    process.env.TF_BUILD = "True";
    process.env.BUILD_SOURCEVERSION = "aaa111";
    process.env.BUILD_SOURCEBRANCH = "refs/heads/feature/azure-test";
    process.env.BUILD_REQUESTEDFOR = "Azure User";
    process.env.BUILD_REPOSITORY_NAME = "my-repo";
    process.env.SYSTEM_PULLREQUEST_TARGETBRANCH = "refs/heads/main";
    process.env.SYSTEM_PULLREQUEST_PULLREQUESTID = "77";
    process.env.BUILD_BUILDID = "5678";
    process.env.SYSTEM_COLLECTIONURI = "https://dev.azure.com/myorg/";
    process.env.SYSTEM_TEAMPROJECT = "MyProject";

    const detector = new AzureDevOpsDetector();
    const env = detector.detect();

    expect(env).toEqual({
      provider: "azure_devops",
      commitSha: "aaa111",
      branch: "feature/azure-test",
      baseBranch: "main",
      actor: "Azure User",
      repository: "my-repo",
      mergeRequestId: "77",
      pipelineId: "5678",
      pipelineUrl: "https://dev.azure.com/myorg/MyProject/_build/results?buildId=5678",
    });
  });

  it("detect strips refs/heads/ from branches", () => {
    process.env.TF_BUILD = "True";
    process.env.BUILD_SOURCEVERSION = "aaa111";
    process.env.BUILD_SOURCEBRANCH = "refs/heads/develop";
    process.env.BUILD_REPOSITORY_NAME = "my-repo";
    process.env.SYSTEM_PULLREQUEST_TARGETBRANCH = "refs/heads/main";

    const detector = new AzureDevOpsDetector();
    const env = detector.detect();

    expect(env.branch).toBe("develop");
    expect(env.baseBranch).toBe("main");
  });

  it("detect handles CI-only (no PR vars)", () => {
    process.env.TF_BUILD = "True";
    process.env.BUILD_SOURCEVERSION = "aaa111";
    process.env.BUILD_SOURCEBRANCH = "refs/heads/main";
    process.env.BUILD_REQUESTEDFOR = "Azure User";
    process.env.BUILD_REPOSITORY_NAME = "my-repo";
    process.env.BUILD_BUILDID = "5678";
    process.env.SYSTEM_COLLECTIONURI = "https://dev.azure.com/myorg/";
    process.env.SYSTEM_TEAMPROJECT = "MyProject";

    const detector = new AzureDevOpsDetector();
    const env = detector.detect();

    expect(env.baseBranch).toBeUndefined();
    expect(env.mergeRequestId).toBeUndefined();
    expect(env.branch).toBe("main");
  });

  it("detect throws when BUILD_SOURCEVERSION is missing", () => {
    process.env.TF_BUILD = "True";
    process.env.BUILD_REPOSITORY_NAME = "my-repo";

    const detector = new AzureDevOpsDetector();
    expect(() => detector.detect()).toThrow("BUILD_SOURCEVERSION");
  });

  it("detect throws when BUILD_REPOSITORY_NAME is missing", () => {
    process.env.TF_BUILD = "True";
    process.env.BUILD_SOURCEVERSION = "aaa111";

    const detector = new AzureDevOpsDetector();
    expect(() => detector.detect()).toThrow("BUILD_REPOSITORY_NAME");
  });
});
