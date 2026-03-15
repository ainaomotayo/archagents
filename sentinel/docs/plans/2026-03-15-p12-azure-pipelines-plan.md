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

Expected: 8 files — `types.ts`, `azure-devops.ts`, `azure-devops.test.ts`, `github.ts`, `github.test.ts`, `gitlab.ts`, `gitlab.test.ts`, `generic.ts`, `detect.ts`, `detect.test.ts`
