# P12: Azure Pipelines CI/CD Template — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Sentinel scans in Azure DevOps Pipelines by creating a YAML template, refactoring the CLI to auto-detect Azure DevOps environment variables via a Strategy pattern, and adding exponential backoff to the poll loop.

**Architecture:** Strategy pattern for CI provider detection (mirrors existing VCS provider pattern), single-stage pipeline template consistent with GitHub Actions/GitLab CI templates, exponential backoff with jitter for poll efficiency.

**Tech Stack:** TypeScript (vitest), Azure Pipelines YAML, Node.js 22

---

### Task 1: Azure Pipelines YAML Template

**Files:**
- Create: `sentinel/templates/azure-pipelines.yml`

**Step 1: Create the template file**

```yaml
# SENTINEL Scan - Azure Pipelines Integration Template
#
# Add this file to your repository root as azure-pipelines.yml
# or include it via pipeline templates.
#
# Required pipeline variables (Settings > Pipelines > Library > Variable Group,
# or inline under the pipeline Variables tab):
#   - SENTINEL_API_URL: Your SENTINEL API endpoint (e.g. https://sentinel.example.com)
#   - SENTINEL_API_KEY: Your SENTINEL API key (mark as secret)
#   - SENTINEL_SECRET: Your HMAC shared secret (mark as secret)

trigger:
  branches:
    include:
      - '*'

pr:
  branches:
    include:
      - '*'

pool:
  vmImage: ubuntu-latest

steps:
  - checkout: self
    fetchDepth: 0

  - task: NodeTool@0
    displayName: Setup Node.js
    inputs:
      versionSpec: '22.x'

  - script: npm install -g @sentinel/cli
    displayName: Install SENTINEL CLI

  - script: |
      if [ -n "$(System.PullRequest.PullRequestId)" ]; then
        DIFF=$(git diff origin/$(System.PullRequest.TargetBranch)...HEAD)
      else
        DIFF=$(git diff HEAD~1 HEAD 2>/dev/null || echo "")
      fi
      if [ -z "$DIFF" ]; then
        echo "No changes to scan."
        exit 0
      fi
      echo "$DIFF" | sentinel ci --api-url $(SENTINEL_API_URL)
    displayName: Run SENTINEL Scan
    env:
      SENTINEL_API_KEY: $(SENTINEL_API_KEY)
      SENTINEL_SECRET: $(SENTINEL_SECRET)
    timeoutInMinutes: 10
```

**Step 2: Verify YAML is valid**

Run: `cd /home/ainaomotayo/archagents/sentinel && node -e "const yaml = require('yaml'); const fs = require('fs'); yaml.parse(fs.readFileSync('templates/azure-pipelines.yml','utf8')); console.log('YAML valid')"`

If the yaml package isn't available, use: `python3 -c "import yaml; yaml.safe_load(open('templates/azure-pipelines.yml')); print('YAML valid')"`

Expected: `YAML valid`

**Step 3: Commit**

```bash
git add sentinel/templates/azure-pipelines.yml
git commit -m "feat(templates): add Azure Pipelines CI/CD template"
```

---

### Task 2: CI Provider Detection — Types & Interface

**Files:**
- Create: `sentinel/apps/cli/src/ci-providers/types.ts`

**Step 1: Create the types file**

```typescript
export interface CiProviderInfo {
  provider: string;
  commitHash: string;
  branch: string;
  author: string;
  prNumber?: number;
  projectId: string;
  repositoryUrl?: string;
}

export interface CiProviderDetector {
  readonly name: string;
  canDetect(): boolean;
  detect(): CiProviderInfo;
}
```

**Step 2: Commit**

```bash
git add sentinel/apps/cli/src/ci-providers/types.ts
git commit -m "feat(cli): add CI provider detection interfaces"
```

---

### Task 3: CI Provider Detection — Azure DevOps Detector + Tests

**Files:**
- Create: `sentinel/apps/cli/src/ci-providers/azure-devops.ts`
- Create: `sentinel/apps/cli/src/ci-providers/azure-devops.test.ts`

**Step 1: Write the failing tests**

```typescript
// sentinel/apps/cli/src/ci-providers/azure-devops.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AzureDevOpsCiDetector } from "./azure-devops.js";

describe("AzureDevOpsCiDetector", () => {
  const detector = new AzureDevOpsCiDetector();
  const originalEnv = process.env;

  beforeEach(() => {
    vi.stubEnv("TF_BUILD", undefined as any);
    vi.stubEnv("BUILD_SOURCEVERSION", undefined as any);
    vi.stubEnv("BUILD_SOURCEBRANCH", undefined as any);
    vi.stubEnv("BUILD_REQUESTEDFOR", undefined as any);
    vi.stubEnv("SYSTEM_PULLREQUEST_PULLREQUESTID", undefined as any);
    vi.stubEnv("BUILD_REPOSITORY_NAME", undefined as any);
    vi.stubEnv("BUILD_REPOSITORY_URI", undefined as any);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("canDetect", () => {
    it("returns true when TF_BUILD is True", () => {
      vi.stubEnv("TF_BUILD", "True");
      expect(detector.canDetect()).toBe(true);
    });

    it("returns false when TF_BUILD is not set", () => {
      expect(detector.canDetect()).toBe(false);
    });

    it("returns false when TF_BUILD is not True", () => {
      vi.stubEnv("TF_BUILD", "false");
      expect(detector.canDetect()).toBe(false);
    });
  });

  describe("detect", () => {
    beforeEach(() => {
      vi.stubEnv("TF_BUILD", "True");
      vi.stubEnv("BUILD_SOURCEVERSION", "abc123def456");
      vi.stubEnv("BUILD_SOURCEBRANCH", "refs/heads/feature/cool");
      vi.stubEnv("BUILD_REQUESTEDFOR", "Alice Developer");
      vi.stubEnv("BUILD_REPOSITORY_NAME", "my-repo");
      vi.stubEnv("BUILD_REPOSITORY_URI", "https://dev.azure.com/org/project/_git/my-repo");
    });

    it("extracts commit hash from BUILD_SOURCEVERSION", () => {
      const info = detector.detect();
      expect(info.commitHash).toBe("abc123def456");
    });

    it("strips refs/heads/ prefix from branch", () => {
      const info = detector.detect();
      expect(info.branch).toBe("feature/cool");
    });

    it("extracts author from BUILD_REQUESTEDFOR", () => {
      const info = detector.detect();
      expect(info.author).toBe("Alice Developer");
    });

    it("extracts projectId from BUILD_REPOSITORY_NAME", () => {
      const info = detector.detect();
      expect(info.projectId).toBe("my-repo");
    });

    it("extracts repositoryUrl from BUILD_REPOSITORY_URI", () => {
      const info = detector.detect();
      expect(info.repositoryUrl).toBe("https://dev.azure.com/org/project/_git/my-repo");
    });

    it("sets provider to azure_devops", () => {
      const info = detector.detect();
      expect(info.provider).toBe("azure_devops");
    });

    it("parses PR number when SYSTEM_PULLREQUEST_PULLREQUESTID is set", () => {
      vi.stubEnv("SYSTEM_PULLREQUEST_PULLREQUESTID", "42");
      const info = detector.detect();
      expect(info.prNumber).toBe(42);
    });

    it("leaves prNumber undefined when not a PR build", () => {
      const info = detector.detect();
      expect(info.prNumber).toBeUndefined();
    });

    it("uses refs/heads/main branch for PR builds from SYSTEM_PULLREQUEST_SOURCEBRANCH", () => {
      vi.stubEnv("SYSTEM_PULLREQUEST_SOURCEBRANCH", "refs/heads/pr-branch");
      vi.stubEnv("SYSTEM_PULLREQUEST_PULLREQUESTID", "7");
      const info = detector.detect();
      expect(info.branch).toBe("pr-branch");
    });

    it("falls back to unknown for missing env vars", () => {
      vi.stubEnv("BUILD_SOURCEVERSION", undefined as any);
      vi.stubEnv("BUILD_SOURCEBRANCH", undefined as any);
      vi.stubEnv("BUILD_REQUESTEDFOR", undefined as any);
      vi.stubEnv("BUILD_REPOSITORY_NAME", undefined as any);
      const info = detector.detect();
      expect(info.commitHash).toBe("unknown");
      expect(info.branch).toBe("unknown");
      expect(info.author).toBe("unknown");
      expect(info.projectId).toBe("default");
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/cli 2>&1 | tail -20`

Expected: FAIL — `Cannot find module './azure-devops.js'`

**Step 3: Write the Azure DevOps detector implementation**

```typescript
// sentinel/apps/cli/src/ci-providers/azure-devops.ts
import type { CiProviderDetector, CiProviderInfo } from "./types.js";

export class AzureDevOpsCiDetector implements CiProviderDetector {
  readonly name = "azure_devops";

  canDetect(): boolean {
    return process.env.TF_BUILD === "True";
  }

  detect(): CiProviderInfo {
    const prId = process.env.SYSTEM_PULLREQUEST_PULLREQUESTID;
    // For PR builds, SYSTEM_PULLREQUEST_SOURCEBRANCH has the source branch
    const rawBranch =
      process.env.SYSTEM_PULLREQUEST_SOURCEBRANCH ??
      process.env.BUILD_SOURCEBRANCH ??
      "";

    return {
      provider: "azure_devops",
      commitHash: process.env.BUILD_SOURCEVERSION ?? "unknown",
      branch: rawBranch.replace(/^refs\/heads\//, "") || "unknown",
      author: process.env.BUILD_REQUESTEDFOR ?? "unknown",
      prNumber: prId ? parseInt(prId, 10) : undefined,
      projectId: process.env.BUILD_REPOSITORY_NAME ?? "default",
      repositoryUrl: process.env.BUILD_REPOSITORY_URI,
    };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/cli 2>&1 | tail -20`

Expected: All azure-devops tests PASS

**Step 5: Commit**

```bash
git add sentinel/apps/cli/src/ci-providers/azure-devops.ts sentinel/apps/cli/src/ci-providers/azure-devops.test.ts
git commit -m "feat(cli): add Azure DevOps CI provider detector with tests"
```

---

### Task 4: CI Provider Detection — GitHub Detector + Tests

**Files:**
- Create: `sentinel/apps/cli/src/ci-providers/github.ts`
- Create: `sentinel/apps/cli/src/ci-providers/github.test.ts`

**Step 1: Write the failing tests**

```typescript
// sentinel/apps/cli/src/ci-providers/github.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GitHubCiDetector } from "./github.js";

describe("GitHubCiDetector", () => {
  const detector = new GitHubCiDetector();

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("canDetect", () => {
    it("returns true when GITHUB_ACTIONS is true", () => {
      vi.stubEnv("GITHUB_ACTIONS", "true");
      expect(detector.canDetect()).toBe(true);
    });

    it("returns false when GITHUB_ACTIONS is not set", () => {
      vi.stubEnv("GITHUB_ACTIONS", undefined as any);
      expect(detector.canDetect()).toBe(false);
    });
  });

  describe("detect", () => {
    beforeEach(() => {
      vi.stubEnv("GITHUB_ACTIONS", "true");
      vi.stubEnv("GITHUB_SHA", "gh-sha-123");
      vi.stubEnv("GITHUB_REF_NAME", "main");
      vi.stubEnv("GITHUB_ACTOR", "octocat");
      vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");
    });

    it("extracts all GitHub env vars correctly", () => {
      const info = detector.detect();
      expect(info.provider).toBe("github");
      expect(info.commitHash).toBe("gh-sha-123");
      expect(info.branch).toBe("main");
      expect(info.author).toBe("octocat");
      expect(info.projectId).toBe("owner/repo");
    });

    it("parses PR number from GITHUB_REF when it matches pulls pattern", () => {
      vi.stubEnv("GITHUB_REF", "refs/pull/99/merge");
      const info = detector.detect();
      expect(info.prNumber).toBe(99);
    });

    it("leaves prNumber undefined for non-PR refs", () => {
      vi.stubEnv("GITHUB_REF", "refs/heads/main");
      const info = detector.detect();
      expect(info.prNumber).toBeUndefined();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/cli 2>&1 | tail -20`

Expected: FAIL — `Cannot find module './github.js'`

**Step 3: Write the GitHub detector implementation**

```typescript
// sentinel/apps/cli/src/ci-providers/github.ts
import type { CiProviderDetector, CiProviderInfo } from "./types.js";

export class GitHubCiDetector implements CiProviderDetector {
  readonly name = "github";

  canDetect(): boolean {
    return process.env.GITHUB_ACTIONS === "true";
  }

  detect(): CiProviderInfo {
    const ref = process.env.GITHUB_REF ?? "";
    const prMatch = ref.match(/^refs\/pull\/(\d+)\/merge$/);

    return {
      provider: "github",
      commitHash: process.env.GITHUB_SHA ?? "unknown",
      branch: process.env.GITHUB_REF_NAME ?? "unknown",
      author: process.env.GITHUB_ACTOR ?? "unknown",
      prNumber: prMatch ? parseInt(prMatch[1], 10) : undefined,
      projectId: process.env.GITHUB_REPOSITORY ?? "default",
      repositoryUrl: process.env.GITHUB_SERVER_URL
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`
        : undefined,
    };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/cli 2>&1 | tail -20`

Expected: All github tests PASS

**Step 5: Commit**

```bash
git add sentinel/apps/cli/src/ci-providers/github.ts sentinel/apps/cli/src/ci-providers/github.test.ts
git commit -m "feat(cli): add GitHub CI provider detector with tests"
```

---

### Task 5: CI Provider Detection — GitLab Detector + Tests

**Files:**
- Create: `sentinel/apps/cli/src/ci-providers/gitlab.ts`
- Create: `sentinel/apps/cli/src/ci-providers/gitlab.test.ts`

**Step 1: Write the failing tests**

```typescript
// sentinel/apps/cli/src/ci-providers/gitlab.test.ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { GitLabCiDetector } from "./gitlab.js";

describe("GitLabCiDetector", () => {
  const detector = new GitLabCiDetector();

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("canDetect", () => {
    it("returns true when GITLAB_CI is true", () => {
      vi.stubEnv("GITLAB_CI", "true");
      expect(detector.canDetect()).toBe(true);
    });

    it("returns false when GITLAB_CI is not set", () => {
      vi.stubEnv("GITLAB_CI", undefined as any);
      expect(detector.canDetect()).toBe(false);
    });
  });

  describe("detect", () => {
    it("extracts all GitLab CI env vars correctly", () => {
      vi.stubEnv("GITLAB_CI", "true");
      vi.stubEnv("CI_COMMIT_SHA", "gl-sha-456");
      vi.stubEnv("CI_COMMIT_BRANCH", "develop");
      vi.stubEnv("CI_COMMIT_AUTHOR", "GitLab User");
      vi.stubEnv("CI_PROJECT_PATH", "group/project");
      vi.stubEnv("CI_MERGE_REQUEST_IID", "17");
      vi.stubEnv("CI_PROJECT_URL", "https://gitlab.com/group/project");

      const info = detector.detect();
      expect(info.provider).toBe("gitlab");
      expect(info.commitHash).toBe("gl-sha-456");
      expect(info.branch).toBe("develop");
      expect(info.author).toBe("GitLab User");
      expect(info.projectId).toBe("group/project");
      expect(info.prNumber).toBe(17);
      expect(info.repositoryUrl).toBe("https://gitlab.com/group/project");
    });

    it("uses CI_MERGE_REQUEST_SOURCE_BRANCH_NAME for MR builds", () => {
      vi.stubEnv("GITLAB_CI", "true");
      vi.stubEnv("CI_MERGE_REQUEST_SOURCE_BRANCH_NAME", "feature/x");
      vi.stubEnv("CI_COMMIT_BRANCH", "");
      const info = detector.detect();
      expect(info.branch).toBe("feature/x");
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/cli 2>&1 | tail -20`

Expected: FAIL

**Step 3: Write the GitLab detector implementation**

```typescript
// sentinel/apps/cli/src/ci-providers/gitlab.ts
import type { CiProviderDetector, CiProviderInfo } from "./types.js";

export class GitLabCiDetector implements CiProviderDetector {
  readonly name = "gitlab";

  canDetect(): boolean {
    return process.env.GITLAB_CI === "true";
  }

  detect(): CiProviderInfo {
    const mrIid = process.env.CI_MERGE_REQUEST_IID;

    return {
      provider: "gitlab",
      commitHash: process.env.CI_COMMIT_SHA ?? "unknown",
      branch:
        process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME ||
        process.env.CI_COMMIT_BRANCH ||
        "unknown",
      author: process.env.CI_COMMIT_AUTHOR ?? "unknown",
      prNumber: mrIid ? parseInt(mrIid, 10) : undefined,
      projectId: process.env.CI_PROJECT_PATH ?? "default",
      repositoryUrl: process.env.CI_PROJECT_URL,
    };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/cli 2>&1 | tail -20`

Expected: All gitlab tests PASS

**Step 5: Commit**

```bash
git add sentinel/apps/cli/src/ci-providers/gitlab.ts sentinel/apps/cli/src/ci-providers/gitlab.test.ts
git commit -m "feat(cli): add GitLab CI provider detector with tests"
```

---

### Task 6: CI Provider Detection — Generic Fallback + Detection Factory + Tests

**Files:**
- Create: `sentinel/apps/cli/src/ci-providers/generic.ts`
- Create: `sentinel/apps/cli/src/ci-providers/detect.ts`
- Create: `sentinel/apps/cli/src/ci-providers/detect.test.ts`

**Step 1: Write the failing tests for detect**

```typescript
// sentinel/apps/cli/src/ci-providers/detect.test.ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { detectCiProvider } from "./detect.js";

describe("detectCiProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("detects Azure DevOps when TF_BUILD is True", () => {
    vi.stubEnv("TF_BUILD", "True");
    vi.stubEnv("BUILD_SOURCEVERSION", "az-sha");
    vi.stubEnv("BUILD_SOURCEBRANCH", "refs/heads/main");
    vi.stubEnv("BUILD_REQUESTEDFOR", "Alice");
    vi.stubEnv("BUILD_REPOSITORY_NAME", "repo");

    const info = detectCiProvider();
    expect(info.provider).toBe("azure_devops");
    expect(info.commitHash).toBe("az-sha");
  });

  it("detects GitHub when GITHUB_ACTIONS is true", () => {
    vi.stubEnv("GITHUB_ACTIONS", "true");
    vi.stubEnv("GITHUB_SHA", "gh-sha");
    vi.stubEnv("GITHUB_REF_NAME", "main");
    vi.stubEnv("GITHUB_ACTOR", "octocat");
    vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");

    const info = detectCiProvider();
    expect(info.provider).toBe("github");
  });

  it("detects GitLab when GITLAB_CI is true", () => {
    vi.stubEnv("GITLAB_CI", "true");
    vi.stubEnv("CI_COMMIT_SHA", "gl-sha");

    const info = detectCiProvider();
    expect(info.provider).toBe("gitlab");
  });

  it("falls back to generic when no CI detected", () => {
    const info = detectCiProvider();
    expect(info.provider).toBe("generic");
  });

  it("uses SENTINEL_* override vars in generic fallback", () => {
    vi.stubEnv("SENTINEL_COMMIT_HASH", "override-sha");
    vi.stubEnv("SENTINEL_BRANCH", "override-branch");
    vi.stubEnv("SENTINEL_AUTHOR", "override-author");
    vi.stubEnv("SENTINEL_PROJECT_ID", "override-proj");

    const info = detectCiProvider();
    expect(info.provider).toBe("generic");
    expect(info.commitHash).toBe("override-sha");
    expect(info.branch).toBe("override-branch");
    expect(info.author).toBe("override-author");
    expect(info.projectId).toBe("override-proj");
  });

  it("respects SENTINEL_PROVIDER override to force a specific detector", () => {
    vi.stubEnv("SENTINEL_PROVIDER", "gitlab");
    vi.stubEnv("CI_COMMIT_SHA", "gl-sha");
    // Even though TF_BUILD is also set, SENTINEL_PROVIDER forces GitLab
    vi.stubEnv("TF_BUILD", "True");

    const info = detectCiProvider();
    expect(info.provider).toBe("gitlab");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/cli 2>&1 | tail -20`

Expected: FAIL

**Step 3: Write the generic fallback detector**

```typescript
// sentinel/apps/cli/src/ci-providers/generic.ts
import type { CiProviderDetector, CiProviderInfo } from "./types.js";

export class GenericCiDetector implements CiProviderDetector {
  readonly name = "generic";

  canDetect(): boolean {
    // Always matches as the fallback
    return true;
  }

  detect(): CiProviderInfo {
    return {
      provider: "generic",
      commitHash: process.env.SENTINEL_COMMIT_HASH ?? "unknown",
      branch: process.env.SENTINEL_BRANCH ?? "unknown",
      author: process.env.SENTINEL_AUTHOR ?? "unknown",
      projectId: process.env.SENTINEL_PROJECT_ID ?? "default",
    };
  }
}
```

**Step 4: Write the detection factory**

```typescript
// sentinel/apps/cli/src/ci-providers/detect.ts
import type { CiProviderDetector, CiProviderInfo } from "./types.js";
import { AzureDevOpsCiDetector } from "./azure-devops.js";
import { GitHubCiDetector } from "./github.js";
import { GitLabCiDetector } from "./gitlab.js";
import { GenericCiDetector } from "./generic.js";

const detectors: CiProviderDetector[] = [
  new AzureDevOpsCiDetector(),
  new GitHubCiDetector(),
  new GitLabCiDetector(),
  new GenericCiDetector(), // always-true fallback — must be last
];

export function detectCiProvider(): CiProviderInfo {
  // Allow explicit override via SENTINEL_PROVIDER
  const override = process.env.SENTINEL_PROVIDER;
  if (override) {
    const forced = detectors.find((d) => d.name === override);
    if (forced) return forced.detect();
  }

  for (const detector of detectors) {
    if (detector.canDetect()) {
      return detector.detect();
    }
  }

  // Should never reach here because GenericCiDetector always matches
  return new GenericCiDetector().detect();
}
```

**Step 5: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/cli 2>&1 | tail -20`

Expected: All detect tests PASS

**Step 6: Commit**

```bash
git add sentinel/apps/cli/src/ci-providers/generic.ts sentinel/apps/cli/src/ci-providers/detect.ts sentinel/apps/cli/src/ci-providers/detect.test.ts
git commit -m "feat(cli): add generic fallback detector and detection factory with tests"
```

---

### Task 7: Integrate Detection Framework into buildPayload()

**Files:**
- Modify: `sentinel/apps/cli/src/commands/ci.ts:75-95` (the `buildPayload` function)

**Step 1: Update buildPayload to use detectCiProvider**

In `sentinel/apps/cli/src/commands/ci.ts`, add the import at the top (after existing imports around line 9):

```typescript
import { detectCiProvider } from "../ci-providers/detect.js";
```

Replace the `buildPayload` function (lines 75-95) with:

```typescript
function buildPayload(rawDiff: string): SentinelDiffPayload {
  const diffFiles = parseDiff(rawDiff);
  const ci = detectCiProvider();
  return {
    projectId: process.env.SENTINEL_PROJECT_ID ?? ci.projectId,
    commitHash: process.env.SENTINEL_COMMIT_HASH ?? ci.commitHash,
    branch: process.env.SENTINEL_BRANCH ?? ci.branch,
    author: process.env.SENTINEL_AUTHOR ?? ci.author,
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

Note: `SENTINEL_*` env vars still take precedence (the `??` chain). The detector provides the fallback values instead of hardcoded `"unknown"`.

**Step 2: Run existing tests to verify backward compatibility**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/cli 2>&1 | tail -30`

Expected: All existing ci.test.ts tests PASS (no behavior change for existing callers)

**Step 3: Commit**

```bash
git add sentinel/apps/cli/src/commands/ci.ts
git commit -m "refactor(cli): integrate CI provider detection into buildPayload"
```

---

### Task 8: Exponential Backoff with Jitter

**Files:**
- Modify: `sentinel/apps/cli/src/commands/ci.ts:128-164` (the `pollForResult` function)
- Modify: `sentinel/apps/cli/src/commands/ci.test.ts` (add backoff test)

**Step 1: Write the failing test for backoff**

Add this test to the `pollForResult` describe block in `sentinel/apps/cli/src/commands/ci.test.ts` (after the existing timeout test around line 312):

```typescript
  it("uses exponential backoff between polls", async () => {
    const assessment = makeAssessment({ status: "full_pass" });
    const fetch = mockFetch([
      { status: 200, body: { status: "pending" } },
      { status: 200, body: { status: "pending" } },
      { status: 200, body: { status: "pending" } },
      { status: 200, body: { status: "full_pass", assessment } },
    ]);

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    await pollForResult("scan-backoff", {
      apiUrl: "http://localhost:8080",
      timeout: 60,
      secret: "test-secret",
      fetchFn: fetch,
    });

    // Should have 3 setTimeout calls (before polls 2, 3, 4)
    const delays = setTimeoutSpy.mock.calls
      .filter(([, ms]) => typeof ms === "number" && ms >= 1000)
      .map(([, ms]) => ms as number);

    expect(delays.length).toBe(3);
    // First delay should be ~1000-1500ms (1000 base + up to 500 jitter)
    expect(delays[0]).toBeGreaterThanOrEqual(1000);
    expect(delays[0]).toBeLessThanOrEqual(1500);
    // Second delay should be ~2000-2500ms
    expect(delays[1]).toBeGreaterThanOrEqual(2000);
    expect(delays[1]).toBeLessThanOrEqual(2500);
    // Third delay should be ~4000-4500ms
    expect(delays[2]).toBeGreaterThanOrEqual(4000);
    expect(delays[2]).toBeLessThanOrEqual(4500);

    setTimeoutSpy.mockRestore();
  });
```

**Step 2: Run tests to verify the new test fails**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/cli 2>&1 | tail -20`

Expected: FAIL — delays are all 2000 (fixed interval)

**Step 3: Update pollForResult with exponential backoff**

Replace the `pollForResult` function in `sentinel/apps/cli/src/commands/ci.ts` (lines 128-164):

```typescript
export async function pollForResult(
  scanId: string,
  options: Pick<CiOptions, "apiUrl" | "timeout" | "secret" | "fetchFn">,
): Promise<PollResult> {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const deadline = Date.now() + options.timeout * 1000;
  const INITIAL_INTERVAL_MS = 1000;
  const MAX_INTERVAL_MS = 16000;
  const BACKOFF_FACTOR = 2;
  let interval = INITIAL_INTERVAL_MS;

  while (Date.now() < deadline) {
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

    if (data.status !== "pending" && data.status !== "scanning") {
      return data;
    }

    // Exponential backoff with jitter
    const jitter = Math.floor(Math.random() * 500);
    await new Promise((resolve) => setTimeout(resolve, interval + jitter));
    interval = Math.min(interval * BACKOFF_FACTOR, MAX_INTERVAL_MS);
  }

  throw new Error(`Scan timed out after ${options.timeout}s`);
}
```

**Step 4: Run tests to verify all pass**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/cli 2>&1 | tail -30`

Expected: All tests PASS including the new backoff test. The existing "polls multiple times" test still passes because it only checks call count and final status, not timing.

**Step 5: Commit**

```bash
git add sentinel/apps/cli/src/commands/ci.ts sentinel/apps/cli/src/commands/ci.test.ts
git commit -m "feat(cli): replace fixed poll interval with exponential backoff and jitter"
```

---

### Task 9: Azure DevOps Setup Documentation

**Files:**
- Create: `sentinel/docs/azure-devops-setup.md`

**Step 1: Write the documentation**

```markdown
# Azure DevOps Integration Setup

This guide walks you through connecting your Azure DevOps repository to SENTINEL for automated security scanning on every push and pull request.

## Prerequisites

- An Azure DevOps project with a Git repository
- A Personal Access Token (PAT) with these scopes:
  - **Code**: Read & Write (for commit statuses and PR comments)
  - **Build**: Read (for pipeline integration)
- A running SENTINEL API instance (see main deployment docs)

## 1. Configure the SENTINEL API

Set these environment variables on your SENTINEL API server:

```bash
VCS_AZURE_DEVOPS_ENABLED=true
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
AZURE_DEVOPS_PROJECT=your-project-name
AZURE_DEVOPS_PAT=your-personal-access-token
```

Restart the API server after setting these variables.

## 2. Add the Pipeline Template

Copy `templates/azure-pipelines.yml` from this repository into the root of your Azure DevOps repo.

Alternatively, create a new file `azure-pipelines.yml` at your repo root with the content from the template.

## 3. Configure Pipeline Variables

In Azure DevOps, go to **Pipelines > Your Pipeline > Edit > Variables** and add:

| Variable | Value | Secret? |
|----------|-------|---------|
| `SENTINEL_API_URL` | `https://your-sentinel-api.example.com` | No |
| `SENTINEL_API_KEY` | Your API key | Yes |
| `SENTINEL_SECRET` | Your HMAC shared secret | Yes |

You can also use a **Variable Group** (Pipelines > Library) to share these across multiple pipelines.

## 4. Set Up Webhooks (Optional)

For real-time scan triggering via webhooks (instead of pipeline-only scanning):

1. Go to **Project Settings > Service Hooks**
2. Click **Create Subscription**
3. Select **Web Hooks** as the service
4. Configure triggers:
   - **Code pushed** — triggers on push events
   - **Pull request created** — triggers on new PRs
   - **Pull request updated** — triggers on PR updates
5. Set the URL to: `https://your-sentinel-api.example.com/webhooks/azure-devops`
6. Set the HTTP headers to include your webhook secret (if configured)

## 5. Verify

1. Push a commit to your repository
2. Check the pipeline run in Azure DevOps — it should show the SENTINEL scan step
3. Check the SENTINEL dashboard for the scan results
4. For PR builds, check that a commit status appears on the PR

## Troubleshooting

**Pipeline fails with "npm install -g @sentinel/cli" error**
- Ensure the agent has internet access to the npm registry
- If using a private npm registry, configure `.npmrc` accordingly

**Scan returns "API error: 401 Unauthorized"**
- Verify `SENTINEL_API_KEY` and `SENTINEL_SECRET` pipeline variables are set correctly
- Ensure variables are marked as secret but accessible to the pipeline

**No diff detected / "No changes to scan"**
- Ensure `fetchDepth: 0` is set in the checkout step (full git history required)
- For PR builds, verify the target branch is accessible

**Webhook not triggering scans**
- Verify the Service Hook URL is correct and reachable from Azure DevOps
- Check the Service Hook history in Project Settings for delivery errors
- Ensure `VCS_AZURE_DEVOPS_ENABLED=true` is set on the API server

**PAT permissions error**
- Verify the PAT has Code Read/Write and Build Read scopes
- Check that the PAT hasn't expired
```

**Step 2: Commit**

```bash
git add sentinel/docs/azure-devops-setup.md
git commit -m "docs: add Azure DevOps integration setup guide"
```

---

### Task 10: Run Full Test Suite & Final Verification

**Files:** None (verification only)

**Step 1: Run CLI tests**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/cli 2>&1 | tail -30`

Expected: All tests pass — existing ci.test.ts tests + new ci-providers tests

**Step 2: Run VCS package tests (confirm Azure DevOps provider still passes)**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/vcs 2>&1 | tail -20`

Expected: All tests pass including azure-devops.test.ts

**Step 3: Run full monorepo test suite**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test 2>&1 | tail -40`

Expected: All suites pass (371+ tests)

**Step 4: Verify template files exist**

Run: `ls -la /home/ainaomotayo/archagents/sentinel/templates/`

Expected: Three files — `github-actions.yml`, `gitlab-ci.yml`, `azure-pipelines.yml`

**Step 5: Verify CI provider detection files exist**

Run: `ls -la /home/ainaomotayo/archagents/sentinel/apps/cli/src/ci-providers/`

Expected: 10 files — `types.ts`, `azure-devops.ts`, `azure-devops.test.ts`, `github.ts`, `github.test.ts`, `gitlab.ts`, `gitlab.test.ts`, `generic.ts`, `detect.ts`, `detect.test.ts`

---

## Phase 2: Extended Scope — Dashboard, Extension, Service Hook Provisioning

---

### Task 11: VCS Installations API Routes

**Files:**
- Create: `sentinel/apps/api/src/routes/vcs-installations.ts`
- Modify: `sentinel/apps/api/src/server.ts` (register route)

**Step 1: Create the VCS installations CRUD route file**

```typescript
// sentinel/apps/api/src/routes/vcs-installations.ts
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@sentinel/db";

interface VcsInstallationsOpts {
  db: PrismaClient;
}

export function registerVcsInstallationRoutes(
  app: FastifyInstance,
  opts: VcsInstallationsOpts,
): void {
  // List installations for current org
  app.get("/v1/vcs-installations", async (request, reply) => {
    const orgId = (request as any).orgId;
    if (!orgId) return reply.code(401).send({ error: "Unauthorized" });

    const installations = await opts.db.vcsInstallation.findMany({
      where: { orgId },
      include: {
        githubExt: true,
        gitlabExt: true,
        bitbucketExt: true,
        azureDevOpsExt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    reply.send({ installations });
  });

  // Create new installation
  app.post("/v1/vcs-installations", async (request, reply) => {
    const orgId = (request as any).orgId;
    if (!orgId) return reply.code(401).send({ error: "Unauthorized" });

    const body = request.body as any;
    const { provider, installationId, owner, webhookSecret, ...providerConfig } = body;

    if (!provider || !installationId || !owner) {
      return reply.code(400).send({ error: "provider, installationId, and owner are required" });
    }

    const installation = await opts.db.vcsInstallation.create({
      data: {
        orgId,
        provider,
        installationId,
        owner,
        webhookSecret: webhookSecret ?? "",
        active: true,
        metadata: {},
        ...(provider === "github" && providerConfig.appId
          ? {
              githubExt: {
                create: {
                  appId: providerConfig.appId,
                  numericInstallId: parseInt(providerConfig.numericInstallId ?? "0", 10),
                  privateKey: providerConfig.privateKey ?? "",
                },
              },
            }
          : {}),
        ...(provider === "gitlab" && providerConfig.accessToken
          ? {
              gitlabExt: {
                create: {
                  gitlabUrl: providerConfig.gitlabUrl ?? "https://gitlab.com",
                  accessToken: providerConfig.accessToken,
                  tokenType: providerConfig.tokenType ?? "personal",
                },
              },
            }
          : {}),
        ...(provider === "bitbucket" && providerConfig.clientKey
          ? {
              bitbucketExt: {
                create: {
                  workspace: providerConfig.workspace ?? "",
                  clientKey: providerConfig.clientKey,
                  sharedSecret: providerConfig.sharedSecret ?? "",
                },
              },
            }
          : {}),
        ...(provider === "azure_devops" && providerConfig.organizationUrl
          ? {
              azureDevOpsExt: {
                create: {
                  organizationUrl: providerConfig.organizationUrl,
                  projectName: providerConfig.projectName ?? "",
                  pat: providerConfig.pat ?? "",
                },
              },
            }
          : {}),
      },
      include: {
        githubExt: true,
        gitlabExt: true,
        bitbucketExt: true,
        azureDevOpsExt: true,
      },
    });

    reply.code(201).send(installation);
  });

  // Update installation
  app.put<{ Params: { id: string } }>("/v1/vcs-installations/:id", async (request, reply) => {
    const orgId = (request as any).orgId;
    if (!orgId) return reply.code(401).send({ error: "Unauthorized" });

    const { id } = request.params;
    const body = request.body as any;

    const existing = await opts.db.vcsInstallation.findFirst({
      where: { id, orgId },
    });
    if (!existing) return reply.code(404).send({ error: "Not found" });

    const updated = await opts.db.vcsInstallation.update({
      where: { id },
      data: {
        active: body.active ?? existing.active,
        webhookSecret: body.webhookSecret ?? existing.webhookSecret,
        owner: body.owner ?? existing.owner,
      },
    });

    reply.send(updated);
  });

  // Delete installation
  app.delete<{ Params: { id: string } }>("/v1/vcs-installations/:id", async (request, reply) => {
    const orgId = (request as any).orgId;
    if (!orgId) return reply.code(401).send({ error: "Unauthorized" });

    const { id } = request.params;
    const existing = await opts.db.vcsInstallation.findFirst({
      where: { id, orgId },
    });
    if (!existing) return reply.code(404).send({ error: "Not found" });

    await opts.db.vcsInstallation.delete({ where: { id } });
    reply.code(204).send();
  });

  // Test connection
  app.post<{ Params: { id: string } }>("/v1/vcs-installations/:id/test", async (request, reply) => {
    const orgId = (request as any).orgId;
    if (!orgId) return reply.code(401).send({ error: "Unauthorized" });

    const { id } = request.params;
    const installation = await opts.db.vcsInstallation.findFirst({
      where: { id, orgId },
      include: { azureDevOpsExt: true, githubExt: true, gitlabExt: true, bitbucketExt: true },
    });
    if (!installation) return reply.code(404).send({ error: "Not found" });

    // Basic connectivity test — returns success if the installation record exists
    // In production, this would call the provider API to verify credentials
    reply.send({ success: true, provider: installation.provider, owner: installation.owner });
  });
}
```

**Step 2: Register the route in server.ts**

Add import and registration alongside existing route registrations in `apps/api/src/server.ts`.

**Step 3: Commit**

```bash
git add sentinel/apps/api/src/routes/vcs-installations.ts sentinel/apps/api/src/server.ts
git commit -m "feat(api): add VCS installations CRUD API routes"
```

---

### Task 12: Dashboard VCS Settings Page

**Files:**
- Create: `sentinel/apps/dashboard/app/(dashboard)/settings/vcs/page.tsx`
- Modify: `sentinel/apps/dashboard/app/(dashboard)/settings/page.tsx` (add VCS nav link)
- Modify: `sentinel/apps/dashboard/lib/mock-data.ts` (add VCS mock data)

**Step 1: Add mock data for VCS installations**

Add to `sentinel/apps/dashboard/lib/mock-data.ts`:

```typescript
export const MOCK_VCS_INSTALLATIONS = [
  {
    id: "vcs-1",
    provider: "github",
    installationId: "12345678",
    owner: "acme-corp",
    active: true,
    webhookSecret: "••••••••",
    createdAt: "2026-02-15T10:00:00Z",
  },
  {
    id: "vcs-2",
    provider: "azure_devops",
    installationId: "repo-guid-1",
    owner: "acme-project",
    active: true,
    webhookSecret: "••••••••",
    createdAt: "2026-03-01T14:30:00Z",
    azureDevOpsExt: {
      organizationUrl: "https://dev.azure.com/acme-corp",
      projectName: "sentinel-demo",
    },
  },
];
```

**Step 2: Create the VCS settings page**

Create `sentinel/apps/dashboard/app/(dashboard)/settings/vcs/page.tsx` following the webhooks page pattern:
- PageHeader with "Add VCS Provider" action button
- Provider selection dropdown (GitHub, GitLab, Bitbucket, Azure DevOps) with dynamic form fields
- Card-based list of existing installations with provider icon, owner, status toggle, delete
- localStorage persistence for mock mode
- Feedback banners for success/error states

The page should use the exact same CSS classes from the webhooks page (`card-shine`, `animate-fade-up`, `rounded-xl border border-border bg-surface-1`, etc.) and import from `@/components/page-header` and `@/components/icons`.

**Step 3: Add VCS link to settings navigation**

In the main settings page, add a card/link for "VCS Providers" alongside existing cards for SSO, Webhooks, etc.

**Step 4: Commit**

```bash
git add sentinel/apps/dashboard/app/(dashboard)/settings/vcs/page.tsx sentinel/apps/dashboard/lib/mock-data.ts sentinel/apps/dashboard/app/(dashboard)/settings/page.tsx
git commit -m "feat(dashboard): add VCS provider configuration settings page"
```

---

### Task 13: Service Hook Auto-Provisioning API

**Files:**
- Create: `sentinel/apps/api/src/vcs/webhook-provisioner.ts`
- Modify: `sentinel/apps/api/src/routes/vcs-installations.ts` (add provision endpoint)

**Step 1: Create the webhook provisioner module**

```typescript
// sentinel/apps/api/src/vcs/webhook-provisioner.ts

export interface ProvisionResult {
  success: boolean;
  hookIds: string[];
  errors: string[];
}

export interface WebhookInfo {
  id: string;
  eventType: string;
  url: string;
  active: boolean;
}

interface AzureDevOpsConfig {
  organizationUrl: string;
  projectName: string;
  pat: string;
}

export async function provisionAzureDevOpsHooks(
  config: AzureDevOpsConfig,
  callbackUrl: string,
): Promise<ProvisionResult> {
  const authHeader = `Basic ${Buffer.from(`:${config.pat}`).toString("base64")}`;
  const baseUrl = `${config.organizationUrl}/_apis/hooks/subscriptions?api-version=7.0`;

  const eventTypes = [
    "git.push",
    "git.pullrequest.created",
    "git.pullrequest.updated",
  ];

  const hookIds: string[] = [];
  const errors: string[] = [];

  for (const eventType of eventTypes) {
    try {
      const resp = await fetch(baseUrl, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          publisherId: "tfs",
          eventType,
          consumerId: "webHooks",
          consumerActionId: "httpRequest",
          publisherInputs: {
            projectId: config.projectName,
            repository: "",
          },
          consumerInputs: {
            url: callbackUrl,
          },
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        errors.push(`${eventType}: ${resp.status} ${text}`);
        continue;
      }

      const data = (await resp.json()) as { id: string };
      hookIds.push(data.id);
    } catch (err: any) {
      errors.push(`${eventType}: ${err.message}`);
    }
  }

  return {
    success: errors.length === 0,
    hookIds,
    errors,
  };
}

export async function listAzureDevOpsHooks(
  config: AzureDevOpsConfig,
): Promise<WebhookInfo[]> {
  const authHeader = `Basic ${Buffer.from(`:${config.pat}`).toString("base64")}`;
  const url = `${config.organizationUrl}/_apis/hooks/subscriptions?api-version=7.0`;

  const resp = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!resp.ok) return [];

  const data = (await resp.json()) as { value?: Array<any> };
  return (data.value ?? [])
    .filter((s: any) => s.consumerId === "webHooks")
    .map((s: any) => ({
      id: s.id,
      eventType: s.eventType,
      url: s.consumerInputs?.url ?? "",
      active: s.status === "enabled",
    }));
}
```

**Step 2: Add provision endpoint to vcs-installations route**

Add to the existing `registerVcsInstallationRoutes` function:

```typescript
  // Provision webhooks on the VCS provider
  app.post<{ Params: { id: string } }>(
    "/v1/vcs-installations/:id/provision-webhooks",
    async (request, reply) => {
      const orgId = (request as any).orgId;
      if (!orgId) return reply.code(401).send({ error: "Unauthorized" });

      const { id } = request.params;
      const body = request.body as any;
      const callbackUrl = body.callbackUrl as string;
      if (!callbackUrl) {
        return reply.code(400).send({ error: "callbackUrl is required" });
      }

      const installation = await opts.db.vcsInstallation.findFirst({
        where: { id, orgId },
        include: { azureDevOpsExt: true },
      });
      if (!installation) return reply.code(404).send({ error: "Not found" });

      if (installation.provider === "azure_devops" && installation.azureDevOpsExt) {
        const { provisionAzureDevOpsHooks } = await import("../vcs/webhook-provisioner.js");
        const result = await provisionAzureDevOpsHooks(
          {
            organizationUrl: installation.azureDevOpsExt.organizationUrl,
            projectName: installation.azureDevOpsExt.projectName,
            pat: installation.azureDevOpsExt.pat,
          },
          callbackUrl,
        );
        return reply.send(result);
      }

      reply.code(400).send({ error: `Webhook provisioning not yet supported for ${installation.provider}` });
    },
  );
```

**Step 3: Commit**

```bash
git add sentinel/apps/api/src/vcs/webhook-provisioner.ts sentinel/apps/api/src/routes/vcs-installations.ts
git commit -m "feat(api): add service hook auto-provisioning for Azure DevOps"
```

---

### Task 14: Azure DevOps Marketplace Extension — Manifest & Task Definition

**Files:**
- Create: `sentinel/extensions/azure-devops/vss-extension.json`
- Create: `sentinel/extensions/azure-devops/sentinel-scan/task.json`
- Create: `sentinel/extensions/azure-devops/overview.md`
- Create: `sentinel/extensions/azure-devops/package.json`

**Step 1: Create the extension manifest**

```json
// sentinel/extensions/azure-devops/vss-extension.json
{
  "$schema": "http://json.schemastore.org/vss-extension",
  "manifestVersion": 1,
  "id": "sentinel-security-scan",
  "version": "0.1.0",
  "name": "SENTINEL Security Scan",
  "description": "AI-powered code governance and compliance scanning for Azure Pipelines.",
  "publisher": "sentinel-security",
  "categories": ["Azure Pipelines"],
  "targets": [
    { "id": "Microsoft.VisualStudio.Services" }
  ],
  "icons": {
    "default": "images/icon.png"
  },
  "content": {
    "details": { "path": "overview.md" }
  },
  "files": [
    { "path": "sentinel-scan" }
  ],
  "contributions": [
    {
      "id": "sentinel-scan-task",
      "type": "ms.vss-distributed-task.task",
      "targets": ["ms.vss-distributed-task.tasks"],
      "properties": {
        "name": "sentinel-scan"
      }
    }
  ]
}
```

**Step 2: Create the task definition**

```json
// sentinel/extensions/azure-devops/sentinel-scan/task.json
{
  "$schema": "https://raw.githubusercontent.com/Microsoft/azure-pipelines-task-lib/master/tasks.schema.json",
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "SentinelScan",
  "friendlyName": "SENTINEL Security Scan",
  "description": "Run SENTINEL AI-powered security and compliance scan on your code changes.",
  "helpMarkDown": "[Learn more](https://sentinel.archagents.dev/docs/azure-devops)",
  "category": "Utility",
  "author": "SENTINEL",
  "version": { "Major": 1, "Minor": 0, "Patch": 0 },
  "instanceNameFormat": "SENTINEL Scan",
  "inputs": [
    {
      "name": "apiUrl",
      "type": "string",
      "label": "SENTINEL API URL",
      "required": true,
      "helpMarkDown": "The URL of your SENTINEL API instance."
    },
    {
      "name": "apiKey",
      "type": "string",
      "label": "API Key",
      "required": true,
      "helpMarkDown": "Your SENTINEL API key. Use a secret variable."
    },
    {
      "name": "secret",
      "type": "string",
      "label": "HMAC Secret",
      "required": true,
      "helpMarkDown": "Your SENTINEL HMAC shared secret. Use a secret variable."
    },
    {
      "name": "timeout",
      "type": "string",
      "label": "Timeout (seconds)",
      "required": false,
      "defaultValue": "120",
      "helpMarkDown": "Maximum time to wait for scan results."
    },
    {
      "name": "outputFormat",
      "type": "pickList",
      "label": "Output Format",
      "required": false,
      "defaultValue": "summary",
      "options": {
        "summary": "Summary",
        "json": "JSON",
        "sarif": "SARIF"
      },
      "helpMarkDown": "Format for scan results output."
    },
    {
      "name": "failOnFindings",
      "type": "boolean",
      "label": "Fail on Findings",
      "required": false,
      "defaultValue": "true",
      "helpMarkDown": "Fail the task if security findings are detected."
    }
  ],
  "execution": {
    "Node16": {
      "target": "dist/index.js"
    }
  }
}
```

**Step 3: Create the overview and package.json**

`overview.md` — Marketplace listing with features, screenshots, setup instructions.

`package.json` — Build scripts: `tsc` to compile `index.ts`, `tfx extension create` to package.

**Step 4: Commit**

```bash
git add sentinel/extensions/azure-devops/
git commit -m "feat(extensions): add Azure DevOps marketplace extension manifest and task definition"
```

---

### Task 15: Azure DevOps Extension — Task Runner Implementation

**Files:**
- Create: `sentinel/extensions/azure-devops/sentinel-scan/index.ts`
- Create: `sentinel/extensions/azure-devops/sentinel-scan/package.json`
- Create: `sentinel/extensions/azure-devops/sentinel-scan/tsconfig.json`

**Step 1: Create the task runner**

```typescript
// sentinel/extensions/azure-devops/sentinel-scan/index.ts
import * as tl from "azure-pipelines-task-lib/task";
import { execSync } from "child_process";

async function run(): Promise<void> {
  try {
    const apiUrl = tl.getInput("apiUrl", true)!;
    const apiKey = tl.getInput("apiKey", true)!;
    const secret = tl.getInput("secret", true)!;
    const timeout = tl.getInput("timeout", false) ?? "120";
    const outputFormat = tl.getInput("outputFormat", false) ?? "summary";
    const failOnFindings = tl.getBoolInput("failOnFindings", false);

    // Install CLI
    tl.debug("Installing @sentinel/cli...");
    execSync("npm install -g @sentinel/cli", { stdio: "inherit" });

    // Build the command
    const formatFlag =
      outputFormat === "json" ? "--json" :
      outputFormat === "sarif" ? "--sarif" : "";
    const cmd = `sentinel ci --api-url ${apiUrl} --timeout ${timeout} ${formatFlag}`.trim();

    // Capture diff
    let diff: string;
    const prId = tl.getVariable("System.PullRequest.PullRequestId");
    if (prId) {
      const targetBranch = tl.getVariable("System.PullRequest.TargetBranch") ?? "main";
      diff = execSync(`git diff origin/${targetBranch.replace("refs/heads/", "")}...HEAD`, {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
    } else {
      diff = execSync("git diff HEAD~1 HEAD", {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
    }

    if (!diff.trim()) {
      tl.setResult(tl.TaskResult.Succeeded, "No changes to scan.");
      return;
    }

    // Run scan via piped stdin
    const result = execSync(`echo "${Buffer.from(diff).toString("base64")}" | base64 -d | ${cmd}`, {
      encoding: "utf-8",
      env: {
        ...process.env,
        SENTINEL_API_KEY: apiKey,
        SENTINEL_SECRET: secret,
      },
      maxBuffer: 10 * 1024 * 1024,
    });

    console.log(result);
    tl.setResult(tl.TaskResult.Succeeded, "SENTINEL scan completed.");
  } catch (err: any) {
    if (err.status === 1 && tl.getBoolInput("failOnFindings", false)) {
      tl.setResult(tl.TaskResult.Failed, "SENTINEL scan found security issues.");
    } else if (err.status === 1) {
      tl.warning("SENTINEL scan found issues but failOnFindings is disabled.");
      tl.setResult(tl.TaskResult.SucceededWithIssues, "Findings detected.");
    } else {
      tl.setResult(tl.TaskResult.Failed, `SENTINEL scan error: ${err.message}`);
    }
  }
}

run();
```

**Step 2: Create package.json and tsconfig.json for the task**

```json
// sentinel/extensions/azure-devops/sentinel-scan/package.json
{
  "name": "sentinel-scan-task",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    "azure-pipelines-task-lib": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0",
    "typescript": "^5.7"
  }
}
```

```json
// sentinel/extensions/azure-devops/sentinel-scan/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["index.ts"]
}
```

**Step 3: Commit**

```bash
git add sentinel/extensions/azure-devops/sentinel-scan/
git commit -m "feat(extensions): add Azure DevOps task runner implementation"
```

---

### Task 16: VCS Installations API Tests

**Files:**
- Create: `sentinel/apps/api/src/routes/vcs-installations.test.ts`

**Step 1: Write tests for VCS installation CRUD**

Test the 5 endpoints: GET list, POST create, PUT update, DELETE, POST test-connection. Use the same mocking pattern as existing API route tests (mock Prisma client, mock request/reply).

**Step 2: Run tests**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/api 2>&1 | tail -30`

Expected: All new + existing API tests pass

**Step 3: Commit**

```bash
git add sentinel/apps/api/src/routes/vcs-installations.test.ts
git commit -m "test(api): add VCS installations CRUD route tests"
```

---

### Task 17: Final Verification — Full Scope

**Files:** None (verification only)

**Step 1: Run full monorepo test suite**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test 2>&1 | tail -40`

Expected: All suites pass

**Step 2: Verify all new files exist**

Run:
```bash
ls sentinel/templates/azure-pipelines.yml
ls sentinel/apps/cli/src/ci-providers/
ls sentinel/apps/api/src/routes/vcs-installations.ts
ls sentinel/apps/api/src/vcs/webhook-provisioner.ts
ls sentinel/apps/dashboard/app/\(dashboard\)/settings/vcs/page.tsx
ls sentinel/extensions/azure-devops/vss-extension.json
ls sentinel/extensions/azure-devops/sentinel-scan/task.json
ls sentinel/extensions/azure-devops/sentinel-scan/index.ts
ls sentinel/docs/azure-devops-setup.md
```

Expected: All files exist

**Step 3: Git log to verify commit history**

Run: `git log --oneline -20`

Expected: Clean commit history with descriptive messages for each task
