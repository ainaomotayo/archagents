# P15: GitLab CI Native Template & CI Provider Detection Framework — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hardcoded GitHub env vars in the CLI `ci` command with a universal CI provider detection framework (Strategy pattern), upgrade the GitLab CI template to production-grade, add a GitLab CI/CD Component, implement exponential backoff polling, and add GitLab Security Dashboard integration via SAST report format.

**Architecture:** Strategy pattern with 4 CI provider detectors (GitHub, GitLab, Azure DevOps, Generic) in a priority-ordered registry. The existing `buildPayload()` in `ci.ts` is refactored to consume a `CiEnvironment` instead of reading raw env vars. Polling switches from fixed 2s intervals to exponential backoff with jitter. A new `formatGitLabSast()` formatter produces `gl-sast-report.json` for GitLab's Security Dashboard.

**Tech Stack:** TypeScript, Vitest, Commander.js, Node.js `child_process` (for generic git fallback)

**Design doc:** `docs/plans/2026-03-17-p15-gitlab-ci-template-design.md`

---

## Task 1: CI Provider Types

**Files:**
- Create: `apps/cli/src/ci-providers/types.ts`

**Step 1: Create the types file**

```typescript
// apps/cli/src/ci-providers/types.ts

export type CiProviderName = "github" | "gitlab" | "azure_devops" | "generic";

export interface CiEnvironment {
  provider: CiProviderName;
  commitSha: string;
  branch: string;
  baseBranch?: string;
  actor: string;
  repository: string;
  mergeRequestId?: string;
  pipelineId?: string;
  pipelineUrl?: string;
  projectId?: string;
  serverUrl?: string;
}

export interface CiProviderDetector {
  readonly name: CiProviderName;
  readonly priority: number;
  canDetect(): boolean;
  detect(): CiEnvironment;
}
```

**Step 2: Verify it compiles**

Run: `cd apps/cli && npx tsc --noEmit src/ci-providers/types.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/cli/src/ci-providers/types.ts
git commit -m "feat(cli): add CI provider detection types"
```

---

## Task 2: GitHub Actions Detector

**Files:**
- Create: `apps/cli/src/ci-providers/github.ts`
- Create: `apps/cli/src/ci-providers/__tests__/github.test.ts`

**Step 1: Write the failing tests**

```typescript
// apps/cli/src/ci-providers/__tests__/github.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GitHubDetector } from "../github.js";

describe("GitHubDetector", () => {
  const detector = new GitHubDetector();
  const savedEnv = { ...process.env };

  beforeEach(() => {
    // Clear all GitHub env vars
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITHUB_SHA;
    delete process.env.GITHUB_REF_NAME;
    delete process.env.GITHUB_ACTOR;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_BASE_REF;
    delete process.env.GITHUB_RUN_ID;
    delete process.env.GITHUB_SERVER_URL;
    delete process.env.GITHUB_RUN_NUMBER;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("has name 'github' and priority 10", () => {
    expect(detector.name).toBe("github");
    expect(detector.priority).toBe(10);
  });

  it("canDetect returns true when GITHUB_ACTIONS is set", () => {
    process.env.GITHUB_ACTIONS = "true";
    expect(detector.canDetect()).toBe(true);
  });

  it("canDetect returns false when GITHUB_ACTIONS is not set", () => {
    expect(detector.canDetect()).toBe(false);
  });

  it("detect extracts full PR context", () => {
    process.env.GITHUB_ACTIONS = "true";
    process.env.GITHUB_SHA = "abc123def456";
    process.env.GITHUB_REF_NAME = "feature/my-branch";
    process.env.GITHUB_ACTOR = "octocat";
    process.env.GITHUB_REPOSITORY = "org/repo";
    process.env.GITHUB_BASE_REF = "main";
    process.env.GITHUB_RUN_ID = "12345";
    process.env.GITHUB_SERVER_URL = "https://github.com";

    const env = detector.detect();
    expect(env).toEqual({
      provider: "github",
      commitSha: "abc123def456",
      branch: "feature/my-branch",
      baseBranch: "main",
      actor: "octocat",
      repository: "org/repo",
      mergeRequestId: undefined,
      pipelineId: "12345",
      pipelineUrl: "https://github.com/org/repo/actions/runs/12345",
      projectId: undefined,
      serverUrl: "https://github.com",
    });
  });

  it("detect handles push context (no base ref)", () => {
    process.env.GITHUB_ACTIONS = "true";
    process.env.GITHUB_SHA = "abc123";
    process.env.GITHUB_REF_NAME = "main";
    process.env.GITHUB_ACTOR = "octocat";
    process.env.GITHUB_REPOSITORY = "org/repo";

    const env = detector.detect();
    expect(env.provider).toBe("github");
    expect(env.baseBranch).toBeUndefined();
    expect(env.pipelineUrl).toBeUndefined();
  });

  it("detect throws when GITHUB_SHA is missing", () => {
    process.env.GITHUB_ACTIONS = "true";
    // No GITHUB_SHA
    process.env.GITHUB_REF_NAME = "main";
    process.env.GITHUB_ACTOR = "octocat";
    process.env.GITHUB_REPOSITORY = "org/repo";

    expect(() => detector.detect()).toThrow("GITHUB_SHA");
  });

  it("detect throws when GITHUB_REPOSITORY is missing", () => {
    process.env.GITHUB_ACTIONS = "true";
    process.env.GITHUB_SHA = "abc123";
    process.env.GITHUB_REF_NAME = "main";
    process.env.GITHUB_ACTOR = "octocat";
    // No GITHUB_REPOSITORY

    expect(() => detector.detect()).toThrow("GITHUB_REPOSITORY");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/cli && npx vitest run src/ci-providers/__tests__/github.test.ts`
Expected: FAIL — module `../github.js` not found

**Step 3: Implement GitHubDetector**

```typescript
// apps/cli/src/ci-providers/github.ts
import type { CiEnvironment, CiProviderDetector } from "./types.js";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

export class GitHubDetector implements CiProviderDetector {
  readonly name = "github" as const;
  readonly priority = 10;

  canDetect(): boolean {
    return !!process.env.GITHUB_ACTIONS;
  }

  detect(): CiEnvironment {
    const sha = requireEnv("GITHUB_SHA");
    const repository = requireEnv("GITHUB_REPOSITORY");
    const branch = process.env.GITHUB_REF_NAME ?? "unknown";
    const actor = process.env.GITHUB_ACTOR ?? "unknown";
    const baseRef = process.env.GITHUB_BASE_REF || undefined;
    const runId = process.env.GITHUB_RUN_ID;
    const serverUrl = process.env.GITHUB_SERVER_URL;

    let pipelineUrl: string | undefined;
    if (serverUrl && runId) {
      pipelineUrl = `${serverUrl}/${repository}/actions/runs/${runId}`;
    }

    return {
      provider: this.name,
      commitSha: sha,
      branch,
      baseBranch: baseRef,
      actor,
      repository,
      mergeRequestId: undefined,
      pipelineId: runId,
      pipelineUrl,
      projectId: undefined,
      serverUrl,
    };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/cli && npx vitest run src/ci-providers/__tests__/github.test.ts`
Expected: 7 tests PASS

**Step 5: Commit**

```bash
git add apps/cli/src/ci-providers/github.ts apps/cli/src/ci-providers/__tests__/github.test.ts
git commit -m "feat(cli): add GitHub Actions CI provider detector"
```

---

## Task 3: GitLab CI Detector

**Files:**
- Create: `apps/cli/src/ci-providers/gitlab.ts`
- Create: `apps/cli/src/ci-providers/__tests__/gitlab.test.ts`

**Step 1: Write the failing tests**

```typescript
// apps/cli/src/ci-providers/__tests__/gitlab.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GitLabDetector } from "../gitlab.js";

describe("GitLabDetector", () => {
  const detector = new GitLabDetector();
  const savedEnv = { ...process.env };

  beforeEach(() => {
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
    process.env = { ...savedEnv };
  });

  it("has name 'gitlab' and priority 20", () => {
    expect(detector.name).toBe("gitlab");
    expect(detector.priority).toBe(20);
  });

  it("canDetect returns true when GITLAB_CI is set", () => {
    process.env.GITLAB_CI = "true";
    expect(detector.canDetect()).toBe(true);
  });

  it("canDetect returns false when GITLAB_CI is not set", () => {
    expect(detector.canDetect()).toBe(false);
  });

  it("detect extracts full merge request context", () => {
    process.env.GITLAB_CI = "true";
    process.env.CI_COMMIT_SHA = "deadbeef1234";
    process.env.CI_COMMIT_REF_NAME = "feature/login";
    process.env.GITLAB_USER_LOGIN = "dev-user";
    process.env.CI_PROJECT_PATH = "group/project";
    process.env.CI_MERGE_REQUEST_IID = "42";
    process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME = "main";
    process.env.CI_PIPELINE_ID = "98765";
    process.env.CI_PIPELINE_URL = "https://gitlab.com/group/project/-/pipelines/98765";
    process.env.CI_PROJECT_ID = "555";
    process.env.CI_SERVER_URL = "https://gitlab.com";

    const env = detector.detect();
    expect(env).toEqual({
      provider: "gitlab",
      commitSha: "deadbeef1234",
      branch: "feature/login",
      baseBranch: "main",
      actor: "dev-user",
      repository: "group/project",
      mergeRequestId: "42",
      pipelineId: "98765",
      pipelineUrl: "https://gitlab.com/group/project/-/pipelines/98765",
      projectId: "555",
      serverUrl: "https://gitlab.com",
    });
  });

  it("detect handles push context (no MR vars)", () => {
    process.env.GITLAB_CI = "true";
    process.env.CI_COMMIT_SHA = "deadbeef1234";
    process.env.CI_COMMIT_REF_NAME = "main";
    process.env.GITLAB_USER_LOGIN = "dev-user";
    process.env.CI_PROJECT_PATH = "group/project";
    process.env.CI_PROJECT_ID = "555";

    const env = detector.detect();
    expect(env.provider).toBe("gitlab");
    expect(env.baseBranch).toBeUndefined();
    expect(env.mergeRequestId).toBeUndefined();
  });

  it("detect throws when CI_COMMIT_SHA is missing", () => {
    process.env.GITLAB_CI = "true";
    process.env.CI_COMMIT_REF_NAME = "main";
    process.env.GITLAB_USER_LOGIN = "dev-user";
    process.env.CI_PROJECT_PATH = "group/project";

    expect(() => detector.detect()).toThrow("CI_COMMIT_SHA");
  });

  it("detect throws when CI_PROJECT_PATH is missing", () => {
    process.env.GITLAB_CI = "true";
    process.env.CI_COMMIT_SHA = "abc";
    process.env.CI_COMMIT_REF_NAME = "main";
    process.env.GITLAB_USER_LOGIN = "dev-user";

    expect(() => detector.detect()).toThrow("CI_PROJECT_PATH");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/cli && npx vitest run src/ci-providers/__tests__/gitlab.test.ts`
Expected: FAIL — module not found

**Step 3: Implement GitLabDetector**

```typescript
// apps/cli/src/ci-providers/gitlab.ts
import type { CiEnvironment, CiProviderDetector } from "./types.js";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

export class GitLabDetector implements CiProviderDetector {
  readonly name = "gitlab" as const;
  readonly priority = 20;

  canDetect(): boolean {
    return !!process.env.GITLAB_CI;
  }

  detect(): CiEnvironment {
    const sha = requireEnv("CI_COMMIT_SHA");
    const repository = requireEnv("CI_PROJECT_PATH");
    const branch = process.env.CI_COMMIT_REF_NAME ?? "unknown";
    const actor = process.env.GITLAB_USER_LOGIN ?? "unknown";
    const mrIid = process.env.CI_MERGE_REQUEST_IID || undefined;
    const targetBranch = process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME || undefined;

    return {
      provider: this.name,
      commitSha: sha,
      branch,
      baseBranch: targetBranch,
      actor,
      repository,
      mergeRequestId: mrIid,
      pipelineId: process.env.CI_PIPELINE_ID,
      pipelineUrl: process.env.CI_PIPELINE_URL,
      projectId: process.env.CI_PROJECT_ID,
      serverUrl: process.env.CI_SERVER_URL,
    };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/cli && npx vitest run src/ci-providers/__tests__/gitlab.test.ts`
Expected: 7 tests PASS

**Step 5: Commit**

```bash
git add apps/cli/src/ci-providers/gitlab.ts apps/cli/src/ci-providers/__tests__/gitlab.test.ts
git commit -m "feat(cli): add GitLab CI provider detector"
```

---

## Task 4: Azure DevOps Detector

**Files:**
- Create: `apps/cli/src/ci-providers/azure-devops.ts`
- Create: `apps/cli/src/ci-providers/__tests__/azure-devops.test.ts`

**Step 1: Write the failing tests**

```typescript
// apps/cli/src/ci-providers/__tests__/azure-devops.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AzureDevOpsDetector } from "../azure-devops.js";

describe("AzureDevOpsDetector", () => {
  const detector = new AzureDevOpsDetector();
  const savedEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.TF_BUILD;
    delete process.env.BUILD_SOURCEVERSION;
    delete process.env.BUILD_SOURCEBRANCH;
    delete process.env.BUILD_REQUESTEDFOR;
    delete process.env.BUILD_REPOSITORY_NAME;
    delete process.env.SYSTEM_PULLREQUEST_TARGETBRANCH;
    delete process.env.SYSTEM_PULLREQUEST_PULLREQUESTID;
    delete process.env.BUILD_BUILDID;
    delete process.env.SYSTEM_TEAMFOUNDATIONSERVERURI;
    delete process.env.SYSTEM_TEAMPROJECT;
    delete process.env.SYSTEM_COLLECTIONURI;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("has name 'azure_devops' and priority 30", () => {
    expect(detector.name).toBe("azure_devops");
    expect(detector.priority).toBe(30);
  });

  it("canDetect returns true when TF_BUILD is set", () => {
    process.env.TF_BUILD = "True";
    expect(detector.canDetect()).toBe(true);
  });

  it("canDetect returns false when TF_BUILD is not set", () => {
    expect(detector.canDetect()).toBe(false);
  });

  it("detect extracts full PR context", () => {
    process.env.TF_BUILD = "True";
    process.env.BUILD_SOURCEVERSION = "abc123";
    process.env.BUILD_SOURCEBRANCH = "refs/heads/feature/test";
    process.env.BUILD_REQUESTEDFOR = "John Doe";
    process.env.BUILD_REPOSITORY_NAME = "my-repo";
    process.env.SYSTEM_PULLREQUEST_TARGETBRANCH = "refs/heads/main";
    process.env.SYSTEM_PULLREQUEST_PULLREQUESTID = "77";
    process.env.BUILD_BUILDID = "5432";
    process.env.SYSTEM_COLLECTIONURI = "https://dev.azure.com/myorg/";
    process.env.SYSTEM_TEAMPROJECT = "MyProject";

    const env = detector.detect();
    expect(env).toEqual({
      provider: "azure_devops",
      commitSha: "abc123",
      branch: "feature/test",
      baseBranch: "main",
      actor: "John Doe",
      repository: "my-repo",
      mergeRequestId: "77",
      pipelineId: "5432",
      pipelineUrl: "https://dev.azure.com/myorg/MyProject/_build/results?buildId=5432",
      projectId: "MyProject",
      serverUrl: "https://dev.azure.com/myorg/",
    });
  });

  it("detect strips refs/heads/ prefix from branches", () => {
    process.env.TF_BUILD = "True";
    process.env.BUILD_SOURCEVERSION = "abc123";
    process.env.BUILD_SOURCEBRANCH = "refs/heads/develop";
    process.env.BUILD_REQUESTEDFOR = "Dev";
    process.env.BUILD_REPOSITORY_NAME = "repo";

    const env = detector.detect();
    expect(env.branch).toBe("develop");
  });

  it("detect handles CI-only context (no PR vars)", () => {
    process.env.TF_BUILD = "True";
    process.env.BUILD_SOURCEVERSION = "abc123";
    process.env.BUILD_SOURCEBRANCH = "refs/heads/main";
    process.env.BUILD_REQUESTEDFOR = "Dev";
    process.env.BUILD_REPOSITORY_NAME = "repo";

    const env = detector.detect();
    expect(env.baseBranch).toBeUndefined();
    expect(env.mergeRequestId).toBeUndefined();
  });

  it("detect throws when BUILD_SOURCEVERSION is missing", () => {
    process.env.TF_BUILD = "True";
    process.env.BUILD_SOURCEBRANCH = "refs/heads/main";
    process.env.BUILD_REQUESTEDFOR = "Dev";
    process.env.BUILD_REPOSITORY_NAME = "repo";

    expect(() => detector.detect()).toThrow("BUILD_SOURCEVERSION");
  });

  it("detect throws when BUILD_REPOSITORY_NAME is missing", () => {
    process.env.TF_BUILD = "True";
    process.env.BUILD_SOURCEVERSION = "abc";
    process.env.BUILD_SOURCEBRANCH = "refs/heads/main";
    process.env.BUILD_REQUESTEDFOR = "Dev";

    expect(() => detector.detect()).toThrow("BUILD_REPOSITORY_NAME");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/cli && npx vitest run src/ci-providers/__tests__/azure-devops.test.ts`
Expected: FAIL

**Step 3: Implement AzureDevOpsDetector**

```typescript
// apps/cli/src/ci-providers/azure-devops.ts
import type { CiEnvironment, CiProviderDetector } from "./types.js";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

function stripRefsHeads(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
}

export class AzureDevOpsDetector implements CiProviderDetector {
  readonly name = "azure_devops" as const;
  readonly priority = 30;

  canDetect(): boolean {
    return !!process.env.TF_BUILD;
  }

  detect(): CiEnvironment {
    const sha = requireEnv("BUILD_SOURCEVERSION");
    const repository = requireEnv("BUILD_REPOSITORY_NAME");
    const rawBranch = process.env.BUILD_SOURCEBRANCH ?? "unknown";
    const actor = process.env.BUILD_REQUESTEDFOR ?? "unknown";
    const rawTargetBranch = process.env.SYSTEM_PULLREQUEST_TARGETBRANCH;
    const prId = process.env.SYSTEM_PULLREQUEST_PULLREQUESTID || undefined;
    const buildId = process.env.BUILD_BUILDID;
    const collectionUri = process.env.SYSTEM_COLLECTIONURI;
    const teamProject = process.env.SYSTEM_TEAMPROJECT;

    let pipelineUrl: string | undefined;
    if (collectionUri && teamProject && buildId) {
      pipelineUrl = `${collectionUri}${teamProject}/_build/results?buildId=${buildId}`;
    }

    return {
      provider: this.name,
      commitSha: sha,
      branch: stripRefsHeads(rawBranch),
      baseBranch: rawTargetBranch ? stripRefsHeads(rawTargetBranch) : undefined,
      actor,
      repository,
      mergeRequestId: prId,
      pipelineId: buildId,
      pipelineUrl,
      projectId: teamProject,
      serverUrl: collectionUri,
    };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/cli && npx vitest run src/ci-providers/__tests__/azure-devops.test.ts`
Expected: 8 tests PASS

**Step 5: Commit**

```bash
git add apps/cli/src/ci-providers/azure-devops.ts apps/cli/src/ci-providers/__tests__/azure-devops.test.ts
git commit -m "feat(cli): add Azure DevOps CI provider detector"
```

---

## Task 5: Generic (Git CLI) Detector

**Files:**
- Create: `apps/cli/src/ci-providers/generic.ts`
- Create: `apps/cli/src/ci-providers/__tests__/generic.test.ts`

**Step 1: Write the failing tests**

```typescript
// apps/cli/src/ci-providers/__tests__/generic.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We'll mock child_process to avoid depending on real git
vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

import { GenericDetector } from "../generic.js";
import { execSync } from "child_process";

const mockExecSync = vi.mocked(execSync);

describe("GenericDetector", () => {
  const detector = new GenericDetector();

  beforeEach(() => {
    mockExecSync.mockReset();
  });

  it("has name 'generic' and priority 99", () => {
    expect(detector.name).toBe("generic");
    expect(detector.priority).toBe(99);
  });

  it("canDetect always returns true", () => {
    expect(detector.canDetect()).toBe(true);
  });

  it("detect reads commit sha, branch, and user from git", () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === "git rev-parse HEAD") return "a1b2c3d4\n";
      if (cmd === "git branch --show-current") return "my-branch\n";
      if (cmd === "git config user.name") return "Local Dev\n";
      if (cmd.includes("git remote get-url")) return "git@github.com:org/repo.git\n";
      return "";
    });

    const env = detector.detect();
    expect(env.provider).toBe("generic");
    expect(env.commitSha).toBe("a1b2c3d4");
    expect(env.branch).toBe("my-branch");
    expect(env.actor).toBe("Local Dev");
    expect(env.repository).toBe("org/repo");
  });

  it("detect uses 'unknown' fallbacks when git commands fail", () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("not a git repo");
    });

    const env = detector.detect();
    expect(env.provider).toBe("generic");
    expect(env.commitSha).toBe("unknown");
    expect(env.branch).toBe("unknown");
    expect(env.actor).toBe("unknown");
    expect(env.repository).toBe("unknown");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/cli && npx vitest run src/ci-providers/__tests__/generic.test.ts`
Expected: FAIL

**Step 3: Implement GenericDetector**

```typescript
// apps/cli/src/ci-providers/generic.ts
import { execSync } from "child_process";
import type { CiEnvironment, CiProviderDetector } from "./types.js";

function gitCmd(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "unknown";
  }
}

function parseRepoFromRemote(remoteUrl: string): string {
  if (remoteUrl === "unknown") return "unknown";
  // Handle SSH: git@github.com:org/repo.git
  const sshMatch = remoteUrl.match(/:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];
  // Handle HTTPS: https://github.com/org/repo.git
  try {
    const url = new URL(remoteUrl);
    return url.pathname.replace(/^\//, "").replace(/\.git$/, "");
  } catch {
    return remoteUrl;
  }
}

export class GenericDetector implements CiProviderDetector {
  readonly name = "generic" as const;
  readonly priority = 99;

  canDetect(): boolean {
    return true;
  }

  detect(): CiEnvironment {
    const sha = gitCmd("git rev-parse HEAD");
    const branch = gitCmd("git branch --show-current");
    const actor = gitCmd("git config user.name");
    const remote = gitCmd("git remote get-url origin");

    return {
      provider: this.name,
      commitSha: sha,
      branch,
      actor,
      repository: parseRepoFromRemote(remote),
    };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/cli && npx vitest run src/ci-providers/__tests__/generic.test.ts`
Expected: 4 tests PASS

**Step 5: Commit**

```bash
git add apps/cli/src/ci-providers/generic.ts apps/cli/src/ci-providers/__tests__/generic.test.ts
git commit -m "feat(cli): add generic git-based CI provider detector"
```

---

## Task 6: CI Provider Registry

**Files:**
- Create: `apps/cli/src/ci-providers/index.ts`
- Create: `apps/cli/src/ci-providers/__tests__/registry.test.ts`

**Step 1: Write the failing tests**

```typescript
// apps/cli/src/ci-providers/__tests__/registry.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectCiEnvironment } from "../index.js";

describe("detectCiEnvironment", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    // Clear all CI env vars so we control which detector fires
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITLAB_CI;
    delete process.env.TF_BUILD;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("detects GitHub when GITHUB_ACTIONS is set", () => {
    process.env.GITHUB_ACTIONS = "true";
    process.env.GITHUB_SHA = "abc";
    process.env.GITHUB_REF_NAME = "main";
    process.env.GITHUB_ACTOR = "dev";
    process.env.GITHUB_REPOSITORY = "org/repo";

    const env = detectCiEnvironment();
    expect(env.provider).toBe("github");
  });

  it("detects GitLab when GITLAB_CI is set", () => {
    process.env.GITLAB_CI = "true";
    process.env.CI_COMMIT_SHA = "abc";
    process.env.CI_COMMIT_REF_NAME = "main";
    process.env.GITLAB_USER_LOGIN = "dev";
    process.env.CI_PROJECT_PATH = "group/project";

    const env = detectCiEnvironment();
    expect(env.provider).toBe("gitlab");
  });

  it("detects Azure DevOps when TF_BUILD is set", () => {
    process.env.TF_BUILD = "True";
    process.env.BUILD_SOURCEVERSION = "abc";
    process.env.BUILD_SOURCEBRANCH = "refs/heads/main";
    process.env.BUILD_REQUESTEDFOR = "dev";
    process.env.BUILD_REPOSITORY_NAME = "repo";

    const env = detectCiEnvironment();
    expect(env.provider).toBe("azure_devops");
  });

  it("falls back to generic when no CI env vars are set", () => {
    const env = detectCiEnvironment();
    expect(env.provider).toBe("generic");
  });

  it("GitHub wins over GitLab when both are set (lower priority)", () => {
    process.env.GITHUB_ACTIONS = "true";
    process.env.GITHUB_SHA = "abc";
    process.env.GITHUB_REF_NAME = "main";
    process.env.GITHUB_ACTOR = "dev";
    process.env.GITHUB_REPOSITORY = "org/repo";
    process.env.GITLAB_CI = "true";
    process.env.CI_COMMIT_SHA = "abc";
    process.env.CI_PROJECT_PATH = "group/project";

    const env = detectCiEnvironment();
    expect(env.provider).toBe("github");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/cli && npx vitest run src/ci-providers/__tests__/registry.test.ts`
Expected: FAIL

**Step 3: Implement the registry**

```typescript
// apps/cli/src/ci-providers/index.ts
import type { CiEnvironment, CiProviderDetector } from "./types.js";
import { GitHubDetector } from "./github.js";
import { GitLabDetector } from "./gitlab.js";
import { AzureDevOpsDetector } from "./azure-devops.js";
import { GenericDetector } from "./generic.js";

export type { CiEnvironment, CiProviderDetector, CiProviderName } from "./types.js";

const detectors: CiProviderDetector[] = [
  new GitHubDetector(),
  new GitLabDetector(),
  new AzureDevOpsDetector(),
  new GenericDetector(),
].sort((a, b) => a.priority - b.priority);

export function detectCiEnvironment(): CiEnvironment {
  for (const d of detectors) {
    if (d.canDetect()) return d.detect();
  }
  // GenericDetector.canDetect() always returns true, so this is unreachable
  throw new Error("Unable to detect CI environment — no detectors matched");
}
```

**Step 4: Run all CI provider tests**

Run: `cd apps/cli && npx vitest run src/ci-providers/`
Expected: All ~31 tests PASS

**Step 5: Commit**

```bash
git add apps/cli/src/ci-providers/index.ts apps/cli/src/ci-providers/__tests__/registry.test.ts
git commit -m "feat(cli): add CI provider detection registry with auto-detect"
```

---

## Task 7: Exponential Backoff Poll Module

**Files:**
- Create: `apps/cli/src/poll.ts`
- Create: `apps/cli/src/__tests__/poll.test.ts`

**Step 1: Write the failing tests**

```typescript
// apps/cli/src/__tests__/poll.test.ts
import { describe, it, expect, vi } from "vitest";
import { pollWithBackoff } from "../poll.js";

describe("pollWithBackoff", () => {
  it("returns immediately when fn resolves on first call", async () => {
    const fn = vi.fn().mockResolvedValue({ done: true, value: "result" });
    const result = await pollWithBackoff(fn);
    expect(result).toBe("result");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("polls multiple times until done", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ done: false, value: null })
      .mockResolvedValueOnce({ done: false, value: null })
      .mockResolvedValueOnce({ done: true, value: 42 });

    const result = await pollWithBackoff(fn, {
      initialDelayMs: 10,
      maxDelayMs: 50,
      maxJitterMs: 0, // disable jitter for determinism
    });

    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws on timeout", async () => {
    const fn = vi.fn().mockResolvedValue({ done: false, value: null });

    await expect(
      pollWithBackoff(fn, {
        initialDelayMs: 10,
        maxDelayMs: 10,
        maxJitterMs: 0,
        timeoutMs: 50,
      }),
    ).rejects.toThrow("Poll timed out");
  });

  it("respects abort signal", async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockImplementation(async () => {
      controller.abort();
      return { done: false, value: null };
    });

    await expect(
      pollWithBackoff(fn, {
        initialDelayMs: 10,
        maxJitterMs: 0,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });

  it("delay increases exponentially", async () => {
    const delays: number[] = [];
    const startTimes: number[] = [];

    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      startTimes.push(Date.now());
      callCount++;
      if (callCount >= 4) return { done: true, value: "done" };
      return { done: false, value: null };
    });

    await pollWithBackoff(fn, {
      initialDelayMs: 50,
      maxDelayMs: 400,
      backoffFactor: 2,
      maxJitterMs: 0,
    });

    // Verify delays roughly double: ~50ms, ~100ms, ~200ms
    for (let i = 1; i < startTimes.length; i++) {
      delays.push(startTimes[i] - startTimes[i - 1]);
    }

    // First delay should be ~50ms (±30ms tolerance)
    expect(delays[0]).toBeGreaterThanOrEqual(30);
    expect(delays[0]).toBeLessThan(120);

    // Second delay should be ~100ms
    expect(delays[1]).toBeGreaterThanOrEqual(70);
    expect(delays[1]).toBeLessThan(200);
  });

  it("caps delay at maxDelayMs", async () => {
    let callCount = 0;
    const startTimes: number[] = [];

    const fn = vi.fn().mockImplementation(async () => {
      startTimes.push(Date.now());
      callCount++;
      if (callCount >= 6) return { done: true, value: "done" };
      return { done: false, value: null };
    });

    await pollWithBackoff(fn, {
      initialDelayMs: 10,
      maxDelayMs: 30,
      backoffFactor: 2,
      maxJitterMs: 0,
    });

    // After a few iterations, delays should not exceed 30ms (+tolerance)
    const lastDelay = startTimes[startTimes.length - 1] - startTimes[startTimes.length - 2];
    expect(lastDelay).toBeLessThan(80); // 30ms + generous tolerance
  });

  it("uses default options when none provided", async () => {
    const fn = vi.fn().mockResolvedValue({ done: true, value: "ok" });
    const result = await pollWithBackoff(fn);
    expect(result).toBe("ok");
  });

  it("propagates fn errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("API down"));
    await expect(pollWithBackoff(fn)).rejects.toThrow("API down");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/cli && npx vitest run src/__tests__/poll.test.ts`
Expected: FAIL

**Step 3: Implement pollWithBackoff**

```typescript
// apps/cli/src/poll.ts

export interface PollOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  maxJitterMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function pollWithBackoff<T>(
  fn: () => Promise<{ done: boolean; value: T }>,
  opts: PollOptions = {},
): Promise<T> {
  const {
    initialDelayMs = 1000,
    maxDelayMs = 16_000,
    backoffFactor = 2,
    maxJitterMs = 500,
    timeoutMs = 300_000,
  } = opts;

  const deadline = Date.now() + timeoutMs;
  let delay = initialDelayMs;

  while (Date.now() < deadline) {
    opts.signal?.throwIfAborted();

    const result = await fn();
    if (result.done) return result.value;

    const jitter = Math.random() * maxJitterMs;
    const wait = Math.min(delay + jitter, maxDelayMs);
    await new Promise((r) => setTimeout(r, wait));
    delay = Math.min(delay * backoffFactor, maxDelayMs);
  }

  throw new Error(`Poll timed out after ${timeoutMs}ms`);
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/cli && npx vitest run src/__tests__/poll.test.ts`
Expected: 8 tests PASS

**Step 5: Commit**

```bash
git add apps/cli/src/poll.ts apps/cli/src/__tests__/poll.test.ts
git commit -m "feat(cli): add exponential backoff poll module with jitter"
```

---

## Task 8: GitLab SAST Formatter

**Files:**
- Create: `apps/cli/src/formatters/gitlab-sast.ts`
- Create: `apps/cli/src/formatters/__tests__/gitlab-sast.test.ts`

**Step 1: Write the failing tests**

```typescript
// apps/cli/src/formatters/__tests__/gitlab-sast.test.ts
import { describe, it, expect } from "vitest";
import type { SecurityFinding, DependencyFinding, Finding } from "@sentinel/shared";
import { formatGitLabSast, type GitLabSastReport } from "../gitlab-sast.js";

function makeSecurityFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  return {
    type: "security",
    file: "src/auth.ts",
    lineStart: 10,
    lineEnd: 15,
    severity: "high",
    confidence: "high",
    category: "injection",
    title: "SQL Injection",
    description: "User input passed to query without sanitization",
    remediation: "Use parameterized queries",
    scanner: "semgrep",
    cweId: "CWE-89",
    ...overrides,
  };
}

function makeDepFinding(overrides: Partial<DependencyFinding> = {}): DependencyFinding {
  return {
    type: "dependency",
    file: "package.json",
    lineStart: 5,
    lineEnd: 5,
    severity: "critical",
    confidence: "high",
    package: "lodash",
    findingType: "cve",
    detail: "Prototype pollution in lodash",
    existingAlternative: null,
    cveId: "CVE-2021-23337",
    ...overrides,
  };
}

describe("formatGitLabSast", () => {
  it("produces valid GitLab SAST report structure", () => {
    const report = formatGitLabSast([makeSecurityFinding()]);
    expect(report.version).toBe("15.1.0");
    expect(report.scan.type).toBe("sast");
    expect(report.scan.analyzer.id).toBe("sentinel");
    expect(report.scan.scanner.id).toBe("sentinel");
    expect(report.scan.status).toBe("success");
    expect(report.vulnerabilities).toHaveLength(1);
  });

  it("maps severity levels correctly", () => {
    const findings: Finding[] = [
      makeSecurityFinding({ severity: "critical" }),
      makeSecurityFinding({ severity: "high" }),
      makeSecurityFinding({ severity: "medium" }),
      makeSecurityFinding({ severity: "low" }),
    ];
    const report = formatGitLabSast(findings);
    const severities = report.vulnerabilities.map((v) => v.severity);
    expect(severities).toEqual(["Critical", "High", "Medium", "Low"]);
  });

  it("includes file location info", () => {
    const report = formatGitLabSast([
      makeSecurityFinding({ file: "src/foo.ts", lineStart: 5, lineEnd: 10 }),
    ]);
    const loc = report.vulnerabilities[0].location;
    expect(loc.file).toBe("src/foo.ts");
    expect(loc.start_line).toBe(5);
    expect(loc.end_line).toBe(10);
  });

  it("includes CWE identifiers for security findings", () => {
    const report = formatGitLabSast([makeSecurityFinding({ cweId: "CWE-89" })]);
    const ids = report.vulnerabilities[0].identifiers;
    expect(ids).toContainEqual(
      expect.objectContaining({ type: "cwe", name: "CWE-89" }),
    );
  });

  it("includes CVE identifiers for dependency findings", () => {
    const report = formatGitLabSast([makeDepFinding({ cveId: "CVE-2021-23337" })]);
    const ids = report.vulnerabilities[0].identifiers;
    expect(ids).toContainEqual(
      expect.objectContaining({ type: "cve", name: "CVE-2021-23337" }),
    );
  });

  it("handles empty findings array", () => {
    const report = formatGitLabSast([]);
    expect(report.vulnerabilities).toHaveLength(0);
    expect(report.scan.status).toBe("success");
  });

  it("generates unique IDs per vulnerability", () => {
    const report = formatGitLabSast([
      makeSecurityFinding({ title: "A" }),
      makeSecurityFinding({ title: "B" }),
    ]);
    const ids = report.vulnerabilities.map((v) => v.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("sets category to sast for all vulnerabilities", () => {
    const report = formatGitLabSast([makeSecurityFinding(), makeDepFinding()]);
    expect(report.vulnerabilities.every((v) => v.category === "sast")).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/cli && npx vitest run src/formatters/__tests__/gitlab-sast.test.ts`
Expected: FAIL

**Step 3: Implement formatGitLabSast**

```typescript
// apps/cli/src/formatters/gitlab-sast.ts
import { randomUUID } from "crypto";
import type { Finding } from "@sentinel/shared";

export interface GitLabVulnerability {
  id: string;
  category: "sast";
  name: string;
  message: string;
  description: string;
  severity: "Critical" | "High" | "Medium" | "Low" | "Info" | "Unknown";
  confidence: "High" | "Medium" | "Low" | "Unknown";
  location: {
    file: string;
    start_line: number;
    end_line: number;
  };
  identifiers: Array<{
    type: string;
    name: string;
    value: string;
  }>;
}

export interface GitLabSastReport {
  version: "15.1.0";
  scan: {
    analyzer: { id: string; name: string; version: string };
    scanner: { id: string; name: string; version: string };
    type: "sast";
    start_time: string;
    end_time: string;
    status: "success" | "failure";
  };
  vulnerabilities: GitLabVulnerability[];
}

function mapSeverity(severity: string): GitLabVulnerability["severity"] {
  const map: Record<string, GitLabVulnerability["severity"]> = {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
    info: "Info",
  };
  return map[severity] ?? "Unknown";
}

function mapConfidence(confidence: string): GitLabVulnerability["confidence"] {
  const map: Record<string, GitLabVulnerability["confidence"]> = {
    high: "High",
    medium: "Medium",
    low: "Low",
  };
  return map[confidence] ?? "Unknown";
}

function findingName(f: Finding): string {
  switch (f.type) {
    case "security":
      return f.title;
    case "dependency":
      return `${f.findingType}: ${f.package}`;
    case "license":
      return `License: ${f.findingType}`;
    case "quality":
      return `Quality: ${f.metric}`;
    case "policy":
      return `Policy: ${f.policyName}`;
    case "ai-detection":
      return `AI-detected code (${Math.round(f.aiProbability * 100)}%)`;
    default:
      return "Unknown finding";
  }
}

function findingDescription(f: Finding): string {
  switch (f.type) {
    case "security":
      return f.description;
    case "dependency":
      return f.detail;
    case "license":
      return `License ${f.findingType}: ${f.licenseDetected ?? "unknown"}`;
    case "quality":
      return f.detail;
    case "policy":
      return f.violation;
    case "ai-detection":
      return `AI-generated code detected with ${Math.round(f.aiProbability * 100)}% probability`;
    default:
      return "";
  }
}

function findingIdentifiers(f: Finding): GitLabVulnerability["identifiers"] {
  const ids: GitLabVulnerability["identifiers"] = [
    { type: "sentinel_rule", name: `sentinel/${f.type}`, value: f.type },
  ];

  if (f.type === "security" && f.cweId) {
    ids.push({ type: "cwe", name: f.cweId, value: f.cweId });
  }
  if (f.type === "dependency" && f.cveId) {
    ids.push({ type: "cve", name: f.cveId, value: f.cveId });
  }

  return ids;
}

export function formatGitLabSast(findings: Finding[]): GitLabSastReport {
  const now = new Date().toISOString();

  return {
    version: "15.1.0",
    scan: {
      analyzer: { id: "sentinel", name: "SENTINEL", version: "0.1.0" },
      scanner: { id: "sentinel", name: "SENTINEL", version: "0.1.0" },
      type: "sast",
      start_time: now,
      end_time: now,
      status: "success",
    },
    vulnerabilities: findings.map((f) => ({
      id: randomUUID(),
      category: "sast" as const,
      name: findingName(f),
      message: findingName(f),
      description: findingDescription(f),
      severity: mapSeverity(f.severity),
      confidence: mapConfidence(f.confidence),
      location: {
        file: f.file,
        start_line: f.lineStart,
        end_line: f.lineEnd,
      },
      identifiers: findingIdentifiers(f),
    })),
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/cli && npx vitest run src/formatters/__tests__/gitlab-sast.test.ts`
Expected: 8 tests PASS

**Step 5: Commit**

```bash
git add apps/cli/src/formatters/gitlab-sast.ts apps/cli/src/formatters/__tests__/gitlab-sast.test.ts
git commit -m "feat(cli): add GitLab SAST report formatter for Security Dashboard"
```

---

## Task 9: SSE Stream Client (Opt-in)

**Files:**
- Create: `apps/cli/src/stream.ts`

**Step 1: Create the SSE stream module**

This is a forward-looking module. The API endpoint doesn't exist yet, so we implement the client that will be used when `--stream` is passed. It falls back to poll on 404.

```typescript
// apps/cli/src/stream.ts

export interface ScanEvent {
  type: "progress" | "finding" | "complete" | "error";
  data: unknown;
}

export interface StreamOptions {
  apiUrl: string;
  headers: Record<string, string>;
  signal?: AbortSignal;
  onEvent?: (event: ScanEvent) => void;
  fetchFn?: typeof globalThis.fetch;
}

/**
 * Attempts to stream scan results via SSE.
 * Returns the final result on success, or null if the endpoint returns 404
 * (indicating the server doesn't support streaming yet — caller should fall back to poll).
 */
export async function streamScanResults<T>(
  scanId: string,
  opts: StreamOptions,
): Promise<T | null> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;

  const res = await fetchFn(`${opts.apiUrl}/v1/scans/${scanId}/stream`, {
    headers: { ...opts.headers, Accept: "text/event-stream" },
    signal: opts.signal,
  });

  if (res.status === 404) return null; // Server doesn't support SSE — fall back to poll

  if (!res.ok) {
    throw new Error(`Stream error: ${res.status} ${res.statusText}`);
  }

  if (!res.body) {
    throw new Error("Stream response has no body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: T | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE frames
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

    let eventType = "message";
    let dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        dataLines.push(line.slice(6));
      } else if (line === "") {
        // End of event — dispatch
        if (dataLines.length > 0) {
          const raw = dataLines.join("\n");
          try {
            const data = JSON.parse(raw);
            const event: ScanEvent = { type: eventType as ScanEvent["type"], data };
            opts.onEvent?.(event);

            if (eventType === "complete") {
              finalResult = data as T;
            }
          } catch {
            // Non-JSON data — skip
          }
        }
        eventType = "message";
        dataLines = [];
      }
    }
  }

  if (!finalResult) {
    throw new Error("Stream ended without a 'complete' event");
  }

  return finalResult;
}
```

**Step 2: Verify it compiles**

Run: `cd apps/cli && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/cli/src/stream.ts
git commit -m "feat(cli): add SSE stream client for real-time scan results"
```

---

## Task 10: Refactor CI Command to Use Detection Framework

**Files:**
- Modify: `apps/cli/src/commands/ci.ts`
- Modify: `apps/cli/src/commands/ci.test.ts`

This is the integration task. The existing `ci.ts` has hardcoded `GITHUB_SHA`/`GITHUB_REF_NAME`/`GITHUB_ACTOR` in `buildPayload()` and uses fixed 2s poll intervals. We refactor to use `detectCiEnvironment()` and `pollWithBackoff()`.

**Step 1: Update CiOptions interface in ci.ts**

Add `stream` and `gitlabSast` options to the `CiOptions` interface at `apps/cli/src/commands/ci.ts:13-24`:

Replace:
```typescript
export interface CiOptions {
  apiUrl: string;
  apiKey: string;
  secret: string;
  timeout: number;
  json: boolean;
  sarif: boolean;
  /** Allow injecting a custom fetch for testing. */
  fetchFn?: typeof globalThis.fetch;
  /** Allow injecting stdin content for testing. */
  stdinContent?: string;
}
```

With:
```typescript
export interface CiOptions {
  apiUrl: string;
  apiKey: string;
  secret: string;
  timeout: number;
  json: boolean;
  sarif: boolean;
  gitlabSast: boolean;
  stream: boolean;
  /** Allow injecting a custom fetch for testing. */
  fetchFn?: typeof globalThis.fetch;
  /** Allow injecting stdin content for testing. */
  stdinContent?: string;
}
```

**Step 2: Replace `buildPayload()` to accept CiEnvironment**

Replace the `buildPayload` function at `apps/cli/src/commands/ci.ts:75-95`:

Old:
```typescript
function buildPayload(rawDiff: string): SentinelDiffPayload {
  const diffFiles = parseDiff(rawDiff);
  return {
    projectId: process.env.SENTINEL_PROJECT_ID ?? "default",
    commitHash: process.env.SENTINEL_COMMIT_HASH ?? process.env.GITHUB_SHA ?? "unknown",
    branch: process.env.SENTINEL_BRANCH ?? process.env.GITHUB_REF_NAME ?? "unknown",
    author: process.env.SENTINEL_AUTHOR ?? process.env.GITHUB_ACTOR ?? "unknown",
    timestamp: new Date().toISOString(),
    ...
```

New:
```typescript
import { detectCiEnvironment, type CiEnvironment } from "../ci-providers/index.js";
// (add this import at top of file)

function buildPayload(rawDiff: string, env: CiEnvironment): SentinelDiffPayload {
  const diffFiles = parseDiff(rawDiff);
  return {
    projectId: process.env.SENTINEL_PROJECT_ID ?? "default",
    commitHash: process.env.SENTINEL_COMMIT_HASH ?? env.commitSha,
    branch: process.env.SENTINEL_BRANCH ?? env.branch,
    author: process.env.SENTINEL_AUTHOR ?? env.actor,
    timestamp: new Date().toISOString(),
    files: diffFiles.map((f) => ({
      path: f.path,
      language: detectLanguage(f.path),
      hunks: f.hunks,
      aiScore: 0,
    })),
    scanConfig: {
      securityLevel: (process.env.SENTINEL_SECURITY_LEVEL as any) ?? "standard",
      licensePolicy: process.env.SENTINEL_LICENSE_POLICY ?? "",
      qualityThreshold: parseFloat(process.env.SENTINEL_QUALITY_THRESHOLD ?? "0.7"),
    },
  };
}
```

**Step 3: Update submitScan to accept CiEnvironment**

At `apps/cli/src/commands/ci.ts:97-124`, update `submitScan` to pass `env` to `buildPayload`:

```typescript
async function submitScan(
  diff: string,
  env: CiEnvironment,
  options: Pick<CiOptions, "apiUrl" | "apiKey" | "secret" | "fetchFn">,
): Promise<string> {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const payload = buildPayload(diff, env);
  // ... rest unchanged
```

**Step 4: Replace pollForResult to use pollWithBackoff**

Replace the `pollForResult` function at `apps/cli/src/commands/ci.ts:128-164`:

```typescript
import { pollWithBackoff } from "../poll.js";
// (add this import at top of file)

export async function pollForResult(
  scanId: string,
  options: Pick<CiOptions, "apiUrl" | "timeout" | "secret" | "fetchFn">,
): Promise<PollResult> {
  const fetchFn = options.fetchFn ?? globalThis.fetch;

  return pollWithBackoff<PollResult>(
    async () => {
      const signature = signRequest("", options.secret);
      const res = await fetchFn(
        `${options.apiUrl}/v1/scans/${scanId}/poll`,
        {
          headers: {
            "X-Sentinel-Signature": signature,
            "X-Sentinel-API-Key": "cli",
            "X-Sentinel-Role": "service",
          },
        },
      );

      if (!res.ok) {
        throw new Error(`Poll error: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as PollResult;
      const done = data.status !== "pending" && data.status !== "scanning";
      return { done, value: data };
    },
    {
      initialDelayMs: 1000,
      maxDelayMs: 16_000,
      maxJitterMs: 500,
      timeoutMs: options.timeout * 1000,
    },
  );
}
```

**Step 5: Update runCi to use detection and add GitLab SAST output**

Replace `runCi` at `apps/cli/src/commands/ci.ts:293-328`:

```typescript
import { writeFileSync } from "fs";
import { formatGitLabSast } from "../formatters/gitlab-sast.js";
// (add these imports at top of file)

export async function runCi(options: CiOptions): Promise<number> {
  try {
    // 1. Detect CI environment
    const env = detectCiEnvironment();

    // 2. Read diff from stdin
    const diff = options.stdinContent ?? (await readStdin());
    if (!diff.trim()) {
      console.error("Error: no diff provided on stdin");
      return EXIT_ERROR;
    }

    // 3. Submit scan
    const scanId = await submitScan(diff, env, options);

    // 4. Poll for result
    const result = await pollForResult(scanId, options);

    if (!result.assessment) {
      console.error(`Error: scan completed with status '${result.status}' but no assessment`);
      return EXIT_ERROR;
    }

    // 5. Output
    if (options.sarif) {
      console.log(JSON.stringify(formatSarif(result.assessment.findings), null, 2));
    } else if (options.json) {
      console.log(JSON.stringify(result.assessment, null, 2));
    } else {
      console.log(formatSummary(result.assessment));
    }

    // 6. Write GitLab SAST report when requested or auto-detected
    if (options.gitlabSast || env.provider === "gitlab") {
      const sastReport = formatGitLabSast(result.assessment.findings);
      writeFileSync("gl-sast-report.json", JSON.stringify(sastReport, null, 2));
    }

    return exitCodeFromStatus(result.assessment.status);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    return EXIT_ERROR;
  }
}
```

**Step 6: Update existing tests**

In `apps/cli/src/commands/ci.test.ts`, all existing `runCi` calls need `gitlabSast: false` and `stream: false` added to options. For each `runCi({ ... })` call, add:

```typescript
gitlabSast: false,
stream: false,
```

Also add a new test for GitLab SAST auto-generation:

```typescript
import { vi, afterEach } from "vitest";
import * as fs from "fs";

// At the end of the "runCi" describe block, add:

it("writes gl-sast-report.json when gitlabSast option is true", async () => {
  const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
  const assessment = makeAssessment({
    status: "full_pass",
    findings: [makeSecurityFinding()],
  });
  const fetch = mockFetch([
    { status: 200, body: { scanId: "scan-gl" } },
    { status: 200, body: { status: "full_pass", assessment } },
  ]);

  await runCi({
    apiUrl: "http://localhost:8080",
    apiKey: "key",
    secret: "secret",
    timeout: 10,
    json: false,
    sarif: false,
    gitlabSast: true,
    stream: false,
    fetchFn: fetch,
    stdinContent: "diff content",
  });

  expect(writeSpy).toHaveBeenCalledWith(
    "gl-sast-report.json",
    expect.stringContaining('"version":"15.1.0"'),
  );
  writeSpy.mockRestore();
});
```

**Step 7: Run all CLI tests**

Run: `cd apps/cli && npx vitest run`
Expected: All tests PASS

**Step 8: Commit**

```bash
git add apps/cli/src/commands/ci.ts apps/cli/src/commands/ci.test.ts
git commit -m "refactor(cli): use CI provider detection framework and exponential backoff"
```

---

## Task 11: Update CLI Options

**Files:**
- Modify: `apps/cli/src/cli.ts`

**Step 1: Add --stream, --gitlab-sast, and --fail-on flags to the `ci` command**

In `apps/cli/src/cli.ts`, update the `ci` command definition (lines 67-84):

```typescript
program
  .command("ci")
  .description("CI/CD mode — synchronous scan with exit codes")
  .option("--api-url <url>", "API base URL", "http://localhost:8080")
  .option("--timeout <seconds>", "Poll timeout in seconds", "120")
  .option("--json", "Output machine-readable JSON report")
  .option("--sarif", "Output findings in SARIF 2.1.0 format")
  .option("--gitlab-sast", "Write gl-sast-report.json for GitLab Security Dashboard")
  .option("--stream", "Use SSE streaming instead of polling (requires server support)")
  .option("--fail-on <severities>", "Comma-separated severity threshold", "critical,high")
  .option("--format <format>", "Output format: text, json, sarif, gitlab-sast", "text")
  .action(async (opts) => {
    const { runCi } = await import("./commands/ci.js");
    const code = await runCi({
      apiUrl: opts.apiUrl,
      apiKey: process.env.SENTINEL_API_KEY ?? "",
      secret: process.env.SENTINEL_SECRET ?? "",
      timeout: parseInt(opts.timeout, 10),
      json: opts.json ?? opts.format === "json",
      sarif: opts.sarif ?? opts.format === "sarif",
      gitlabSast: opts.gitlabSast ?? opts.format === "gitlab-sast",
      stream: opts.stream ?? false,
    });
    process.exit(code);
  });
```

**Step 2: Also update the `scan` command to pass the new options**

In the `scan` command action (around line 54-63), add the missing options:

```typescript
    const code = await runCi({
      apiUrl: opts.apiUrl,
      apiKey: process.env.SENTINEL_API_KEY ?? "",
      secret: process.env.SENTINEL_SECRET ?? "",
      timeout: parseInt(opts.timeout, 10),
      json: opts.json ?? false,
      sarif: opts.sarif ?? false,
      gitlabSast: false,
      stream: false,
      stdinContent: diff,
    });
```

**Step 3: Verify it compiles**

Run: `cd apps/cli && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/cli/src/cli.ts
git commit -m "feat(cli): add --gitlab-sast, --stream, --fail-on, --format options"
```

---

## Task 12: Upgrade GitLab CI Template

**Files:**
- Modify: `templates/gitlab-ci.yml`

**Step 1: Replace the 24-line stub with the production template**

```yaml
# SENTINEL Scan - GitLab CI Integration Template
#
# Add this to your .gitlab-ci.yml or include via CI/CD includes.
# Required CI/CD variables (Settings > CI/CD > Variables):
#   - SENTINEL_API_URL: Your SENTINEL API endpoint (masked)
#   - SENTINEL_API_KEY: Your SENTINEL API key (masked)
#   - SENTINEL_SECRET: Your HMAC shared secret (masked)
#
# Documentation: https://docs.sentinel.dev/integrations/gitlab

variables:
  SENTINEL_CLI_VERSION: "latest"
  SENTINEL_FAIL_ON: "critical,high"
  SENTINEL_TIMEOUT: "10m"
  SENTINEL_OUTPUT_FORMAT: "text"

.sentinel-base:
  image: node:22-alpine
  before_script:
    - npm install -g @sentinel/cli@${SENTINEL_CLI_VERSION}
  variables:
    GIT_DEPTH: 0

sentinel-scan:
  extends: .sentinel-base
  stage: test
  script:
    - |
      sentinel ci \
        --api-url "${SENTINEL_API_URL}" \
        --fail-on "${SENTINEL_FAIL_ON}" \
        --timeout "${SENTINEL_TIMEOUT}" \
        --format "${SENTINEL_OUTPUT_FORMAT}"
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
  artifacts:
    when: always
    reports:
      sast: gl-sast-report.json
    paths:
      - sentinel-report.json
      - gl-sast-report.json
    expire_in: 30 days
  timeout: 10m
  allow_failure: false

sentinel-scan-sarif:
  extends: .sentinel-base
  stage: test
  script:
    - sentinel ci --api-url "${SENTINEL_API_URL}" --format sarif --output sentinel.sarif
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
      when: manual
      allow_failure: true
  artifacts:
    paths:
      - sentinel.sarif
    expire_in: 30 days
```

**Step 2: Commit**

```bash
git add templates/gitlab-ci.yml
git commit -m "feat(templates): upgrade GitLab CI template to production-grade"
```

---

## Task 13: GitLab CI/CD Component

**Files:**
- Create: `templates/gitlab-component/template.yml`
- Create: `templates/gitlab-component/README.md`

**Step 1: Create the component spec**

```yaml
# templates/gitlab-component/template.yml
# GitLab CI/CD Component — SENTINEL Security Scan
# Publish to GitLab's component catalog for organization-wide reuse.
#
# Usage:
#   include:
#     - component: gitlab.com/YOUR_ORG/sentinel-ci/sentinel-scan@1.0.0
#       inputs:
#         api-url: https://api.sentinel.dev

spec:
  inputs:
    api-url:
      description: "Sentinel API endpoint URL"
      type: string
    api-key:
      description: "Sentinel API key (use CI/CD variable reference)"
      type: string
      default: "$SENTINEL_API_KEY"
    secret:
      description: "HMAC shared secret (use CI/CD variable reference)"
      type: string
      default: "$SENTINEL_SECRET"
    fail-on:
      description: "Comma-separated severity threshold: critical, high, medium, low"
      type: string
      default: "critical,high"
    timeout:
      description: "Scan timeout duration"
      type: string
      default: "10m"
    cli-version:
      description: "Sentinel CLI version to install"
      type: string
      default: "latest"
    enable-sast-report:
      description: "Generate GitLab SAST report for Security Dashboard"
      type: boolean
      default: true
    stage:
      description: "Pipeline stage to run in"
      type: string
      default: "test"

---

sentinel-scan:
  stage: $[[ inputs.stage ]]
  image: node:22-alpine
  variables:
    GIT_DEPTH: 0
    SENTINEL_API_KEY: $[[ inputs.api-key ]]
    SENTINEL_SECRET: $[[ inputs.secret ]]
  before_script:
    - npm install -g @sentinel/cli@$[[ inputs.cli-version ]]
  script:
    - |
      sentinel ci \
        --api-url "$[[ inputs.api-url ]]" \
        --fail-on "$[[ inputs.fail-on ]]" \
        --timeout "$[[ inputs.timeout ]]"
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
  artifacts:
    when: always
    reports:
      sast: gl-sast-report.json
    paths:
      - sentinel-report.json
      - gl-sast-report.json
    expire_in: 30 days
  timeout: $[[ inputs.timeout ]]
  allow_failure: false
```

**Step 2: Create the README**

```markdown
# SENTINEL GitLab CI/CD Component

Reusable GitLab CI/CD component for running SENTINEL security scans in your pipelines.

## Quick Start

Add to your `.gitlab-ci.yml`:

\`\`\`yaml
include:
  - component: gitlab.com/YOUR_ORG/sentinel-ci/sentinel-scan@1.0.0
    inputs:
      api-url: https://api.sentinel.dev
\`\`\`

## Required CI/CD Variables

Set these in **Settings > CI/CD > Variables** (mark as masked):

| Variable | Description |
|----------|-------------|
| `SENTINEL_API_KEY` | Your SENTINEL API key |
| `SENTINEL_SECRET` | Your HMAC shared secret |

## Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `api-url` | string | *(required)* | SENTINEL API endpoint URL |
| `api-key` | string | `$SENTINEL_API_KEY` | API key variable reference |
| `secret` | string | `$SENTINEL_SECRET` | HMAC secret variable reference |
| `fail-on` | string | `critical,high` | Severity threshold |
| `timeout` | string | `10m` | Scan timeout |
| `cli-version` | string | `latest` | CLI version to install |
| `enable-sast-report` | boolean | `true` | Generate GitLab SAST report |
| `stage` | string | `test` | Pipeline stage |

## Security Dashboard Integration

When `enable-sast-report` is `true` (default), the component generates a `gl-sast-report.json` artifact that GitLab's Security Dashboard automatically consumes. Findings appear in:

- **Merge Request > Security widget**
- **Security & Compliance > Vulnerability Report**
- **Security Dashboard** (group/project level)

## Publishing

To publish this component to GitLab's component catalog:

1. Create a new project (e.g., `sentinel-ci`)
2. Copy `template.yml` to the project root
3. Tag a release (e.g., `1.0.0`)
4. The component is available at `gitlab.com/YOUR_ORG/sentinel-ci/sentinel-scan@1.0.0`
```

**Step 3: Commit**

```bash
git add templates/gitlab-component/template.yml templates/gitlab-component/README.md
git commit -m "feat(templates): add GitLab CI/CD Component for component catalog"
```

---

## Task 14: Run Full Test Suite & Verify

**Step 1: Run all CLI tests**

Run: `cd apps/cli && npx vitest run`
Expected: All tests PASS (existing + new ~75 tests)

**Step 2: Run TypeScript compilation check**

Run: `cd apps/cli && npx tsc --noEmit`
Expected: No errors

**Step 3: Run monorepo build**

Run: `npx turbo build --filter=@sentinel/cli`
Expected: Build succeeds

**Step 4: Commit any final fixes if needed**

---

## Task 15: Final Commit & Summary

**Step 1: Verify all changes are committed**

Run: `git status`
Expected: Clean working tree

**Step 2: Review commit log**

Run: `git log --oneline -15`
Expected: ~12 well-structured commits covering types, 4 detectors, registry, poll, formatter, SSE, refactor, CLI options, template, component

---

## Summary of Deliverables

| Deliverable | Files | Tests |
|---|---|---|
| CI Provider Types | `ci-providers/types.ts` | — |
| GitHub Detector | `ci-providers/github.ts` | 7 tests |
| GitLab Detector | `ci-providers/gitlab.ts` | 7 tests |
| Azure DevOps Detector | `ci-providers/azure-devops.ts` | 8 tests |
| Generic Detector | `ci-providers/generic.ts` | 4 tests |
| Registry | `ci-providers/index.ts` | 5 tests |
| Exponential Backoff | `poll.ts` | 8 tests |
| GitLab SAST Formatter | `formatters/gitlab-sast.ts` | 8 tests |
| SSE Stream Client | `stream.ts` | — (no API endpoint yet) |
| Refactored CI Command | `commands/ci.ts` | +1 test, existing tests updated |
| CLI Options | `cli.ts` | — |
| GitLab CI Template | `templates/gitlab-ci.yml` | — |
| GitLab CI/CD Component | `templates/gitlab-component/` | — |
| **Total new tests** | | **~48** |
