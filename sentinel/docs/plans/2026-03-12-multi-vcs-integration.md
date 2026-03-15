# Multi-VCS Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add GitLab, Bitbucket, and Azure DevOps support alongside existing GitHub integration using a unified VCS provider abstraction.

**Architecture:** Strategy pattern with mixin composition base. Each VCS provider implements a `VcsProvider` interface through a shared `VcsProviderBase` abstract class. Webhook normalization uses static dispatch for the 4 core providers. Database uses discriminated union table (`vcs_installation`) with per-provider extension tables. The existing scan pipeline (Redis Streams) remains untouched — only the edges (webhook ingress, diff fetching, results reporting) become provider-aware.

**Tech Stack:** TypeScript, Fastify 5, Vitest, Prisma, Redis, Octokit, @gitbeaker/rest (GitLab), bitbucket (Bitbucket Cloud API), azure-devops-node-api (Azure DevOps)

---

## Dependency Graph

```
Task 1 (types)
  └─> Task 2 (base class)
        ├─> Task 4 (GitLab provider)
        ├─> Task 5 (Bitbucket provider)
        ├─> Task 6 (Azure DevOps provider)
        └─> Task 7 (refactor GitHub into provider)
              └─> Task 8 (vcs-bridge)
                    └─> Task 9 (webhook routes)
                          └─> Task 10 (results reporting)
                                └─> Task 11 (rate limiting)
                                      └─> Task 12 (integration tests)
Task 3 (DB migration) — parallel with Tasks 4-7, required before Task 8
```

---

### Task 1: VCS Provider Types Package

**Files:**
- Create: `packages/vcs/package.json`
- Create: `packages/vcs/tsconfig.json`
- Create: `packages/vcs/src/types.ts`
- Create: `packages/vcs/src/index.ts`
- Create: `packages/vcs/src/__tests__/types.test.ts`

**Context:** This defines the core abstraction. Every VCS provider will implement these interfaces. The `ScanTrigger` interface in `packages/github/src/webhook-handler.ts` is already mostly VCS-agnostic (`type`, `repo`, `owner`, `commitHash`, `branch`, `author`, `prNumber`). We generalize it with a `provider` discriminant and a capability matrix.

**Step 1: Write the failing test**

Create `packages/vcs/src/__tests__/types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type {
  VcsProvider,
  VcsCapabilities,
  VcsScanTrigger,
  VcsWebhookEvent,
  VcsDiffResult,
  VcsStatusReport,
  VcsProviderType,
} from "../types.js";

describe("VCS types", () => {
  it("VcsProviderType has exactly 4 providers", () => {
    const providers: VcsProviderType[] = ["github", "gitlab", "bitbucket", "azure_devops"];
    expect(providers).toHaveLength(4);
  });

  it("VcsScanTrigger extends ScanTrigger with provider field", () => {
    const trigger: VcsScanTrigger = {
      provider: "gitlab",
      type: "merge_request",
      installationId: "inst-123",
      repo: "mygroup/myrepo",
      owner: "mygroup",
      commitHash: "abc123",
      branch: "main",
      author: "user@example.com",
      prNumber: 42,
    };
    expect(trigger.provider).toBe("gitlab");
    expect(trigger.type).toBe("merge_request");
  });

  it("VcsCapabilities describes provider feature matrix", () => {
    const caps: VcsCapabilities = {
      checkRuns: false,
      commitStatus: true,
      prComments: true,
      prAnnotations: false,
      webhookSignatureVerification: true,
      appInstallations: false,
    };
    expect(caps.checkRuns).toBe(false);
    expect(caps.commitStatus).toBe(true);
  });

  it("VcsStatusReport supports multiple reporting strategies", () => {
    const report: VcsStatusReport = {
      scanId: "scan-1",
      commitHash: "abc123",
      status: "full_pass",
      riskScore: 15,
      summary: "All checks passed",
      annotations: [],
    };
    expect(report.scanId).toBe("scan-1");
  });

  it("VcsProvider interface has required methods", () => {
    // Type-level test: verifying the interface shape compiles
    const providerShape: Record<keyof VcsProvider, string> = {
      name: "string",
      type: "string",
      capabilities: "object",
      verifyWebhook: "function",
      parseWebhook: "function",
      fetchDiff: "function",
      reportStatus: "function",
      getInstallationToken: "function",
    };
    expect(Object.keys(providerShape)).toHaveLength(8);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/vcs/src/__tests__/types.test.ts`
Expected: FAIL — module `../types.js` does not exist

**Step 3: Set up package and implement types**

Create `packages/vcs/package.json`:

```json
{
  "name": "@sentinel/vcs",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "build": "tsc"
  },
  "dependencies": {
    "@sentinel/shared": "workspace:*"
  },
  "devDependencies": {
    "vitest": "catalog:",
    "typescript": "catalog:"
  }
}
```

Create `packages/vcs/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `packages/vcs/src/types.ts`:

```typescript
import type { AssessmentStatus, Finding } from "@sentinel/shared";

// ── Provider discriminant ──

export type VcsProviderType = "github" | "gitlab" | "bitbucket" | "azure_devops";

// ── Trigger types per provider ──

export type VcsTriggerType =
  | "push"
  | "pull_request"      // GitHub, Bitbucket
  | "merge_request"     // GitLab
  | "tag_push";         // GitLab, Azure DevOps

// ── Capability matrix ──

export interface VcsCapabilities {
  checkRuns: boolean;              // GitHub only
  commitStatus: boolean;           // All providers
  prComments: boolean;             // All providers
  prAnnotations: boolean;          // GitHub (via Check Run annotations)
  webhookSignatureVerification: boolean;
  appInstallations: boolean;       // GitHub Apps, GitLab Group Access Tokens
}

// ── Unified scan trigger ──

export interface VcsScanTrigger {
  provider: VcsProviderType;
  type: VcsTriggerType;
  installationId: string;          // string to support all providers
  repo: string;                    // "owner/repo" or "group/subgroup/project"
  owner: string;
  commitHash: string;
  branch: string;
  author: string;
  prNumber?: number;
  projectId?: number;              // GitLab project ID, Azure DevOps project ID
  metadata?: Record<string, unknown>;
}

// ── Webhook event (raw, pre-parse) ──

export interface VcsWebhookEvent {
  provider: VcsProviderType;
  headers: Record<string, string>;
  body: unknown;
  rawBody: string;
}

// ── Diff result ──

export interface VcsDiffResult {
  rawDiff: string;
  files: Array<{
    path: string;
    status: "added" | "modified" | "deleted" | "renamed";
  }>;
}

// ── Status reporting ──

export interface VcsAnnotation {
  file: string;
  lineStart: number;
  lineEnd: number;
  level: "notice" | "warning" | "failure";
  title: string;
  message: string;
}

export interface VcsStatusReport {
  scanId: string;
  commitHash: string;
  status: AssessmentStatus;
  riskScore: number;
  summary: string;
  annotations: VcsAnnotation[];
  detailsUrl?: string;
}

// ── Provider interface (Strategy pattern) ──

export interface VcsProvider {
  readonly name: string;
  readonly type: VcsProviderType;
  readonly capabilities: VcsCapabilities;

  /** Verify incoming webhook signature/token */
  verifyWebhook(event: VcsWebhookEvent, secret: string): Promise<boolean>;

  /** Parse raw webhook into a VcsScanTrigger (or null if irrelevant) */
  parseWebhook(event: VcsWebhookEvent): Promise<VcsScanTrigger | null>;

  /** Fetch unified diff for a trigger */
  fetchDiff(trigger: VcsScanTrigger): Promise<VcsDiffResult>;

  /** Report scan results back to the VCS (status, comments, annotations) */
  reportStatus(
    trigger: VcsScanTrigger,
    report: VcsStatusReport,
  ): Promise<void>;

  /** Get an authenticated token/client for API calls */
  getInstallationToken(installationId: string): Promise<string>;
}

// ── Provider registration ──

export interface VcsProviderFactory {
  create(config: VcsProviderConfig): VcsProvider;
}

export interface VcsProviderConfig {
  type: VcsProviderType;
  credentials: Record<string, string>;
  options?: Record<string, unknown>;
}
```

Create `packages/vcs/src/index.ts`:

```typescript
export type {
  VcsProviderType,
  VcsTriggerType,
  VcsCapabilities,
  VcsScanTrigger,
  VcsWebhookEvent,
  VcsDiffResult,
  VcsAnnotation,
  VcsStatusReport,
  VcsProvider,
  VcsProviderFactory,
  VcsProviderConfig,
} from "./types.js";
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ainaomotayo/archagents/.worktrees/human-escalation-approval/sentinel && pnpm install && npx vitest run packages/vcs/src/__tests__/types.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add packages/vcs/
git commit -m "feat(vcs): add VcsProvider interface and types package"
```

---

### Task 2: VcsProviderBase Abstract Class

**Files:**
- Create: `packages/vcs/src/base.ts`
- Create: `packages/vcs/src/__tests__/base.test.ts`
- Modify: `packages/vcs/src/index.ts`

**Context:** Shared infrastructure (logging, rate-limit key generation, annotation formatting, retry helpers) lives here via mixin composition. Concrete providers extend this. The rate limiter in `apps/api/src/github/rate-limiter.ts` uses Redis INCR with a per-installation key and 4500/hr limit — we generalize this pattern.

**Step 1: Write the failing test**

Create `packages/vcs/src/__tests__/base.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { VcsProviderBase } from "../base.js";
import type {
  VcsCapabilities,
  VcsScanTrigger,
  VcsWebhookEvent,
  VcsDiffResult,
  VcsStatusReport,
  VcsProviderType,
} from "../types.js";

class TestProvider extends VcsProviderBase {
  readonly name = "test-provider";
  readonly type: VcsProviderType = "github";
  readonly capabilities: VcsCapabilities = {
    checkRuns: true,
    commitStatus: true,
    prComments: true,
    prAnnotations: true,
    webhookSignatureVerification: true,
    appInstallations: true,
  };

  async verifyWebhook() { return true; }
  async parseWebhook() { return null; }
  async fetchDiff(): Promise<VcsDiffResult> {
    return { rawDiff: "", files: [] };
  }
  async reportStatus() {}
  async getInstallationToken() { return "token"; }
}

describe("VcsProviderBase", () => {
  it("generates correct rate limit key", () => {
    const provider = new TestProvider();
    expect(provider.rateLimitKey("inst-1")).toBe("vcs:ratelimit:github:inst-1");
  });

  it("generates correct correlation key", () => {
    const provider = new TestProvider();
    expect(provider.correlationKey("scan-1")).toBe("scan:vcs:github:scan-1");
  });

  it("formats annotations with severity mapping", () => {
    const provider = new TestProvider();
    const findings = [
      {
        file: "src/main.ts",
        lineStart: 10,
        lineEnd: 15,
        severity: "critical" as const,
        title: "SQL Injection",
        description: "User input not sanitized",
      },
    ];
    const annotations = provider.formatAnnotations(findings);
    expect(annotations).toHaveLength(1);
    expect(annotations[0].level).toBe("failure");
    expect(annotations[0].file).toBe("src/main.ts");
  });

  it("caps annotations at 50", () => {
    const provider = new TestProvider();
    const findings = Array.from({ length: 60 }, (_, i) => ({
      file: `src/file${i}.ts`,
      lineStart: 1,
      lineEnd: 1,
      severity: "low" as const,
      title: `Finding ${i}`,
      description: "desc",
    }));
    const annotations = provider.formatAnnotations(findings);
    expect(annotations).toHaveLength(50);
  });

  it("maps severity to annotation level correctly", () => {
    const provider = new TestProvider();
    expect(provider.severityToLevel("critical")).toBe("failure");
    expect(provider.severityToLevel("high")).toBe("failure");
    expect(provider.severityToLevel("medium")).toBe("warning");
    expect(provider.severityToLevel("low")).toBe("notice");
    expect(provider.severityToLevel("info")).toBe("notice");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/vcs/src/__tests__/base.test.ts`
Expected: FAIL — `../base.js` does not exist

**Step 3: Implement VcsProviderBase**

Create `packages/vcs/src/base.ts`:

```typescript
import type {
  VcsProvider,
  VcsCapabilities,
  VcsScanTrigger,
  VcsWebhookEvent,
  VcsDiffResult,
  VcsStatusReport,
  VcsAnnotation,
  VcsProviderType,
} from "./types.js";

const ANNOTATION_CAP = 50;

interface FindingInput {
  file: string;
  lineStart: number;
  lineEnd: number;
  severity: string;
  title: string;
  description: string;
}

export abstract class VcsProviderBase implements VcsProvider {
  abstract readonly name: string;
  abstract readonly type: VcsProviderType;
  abstract readonly capabilities: VcsCapabilities;

  abstract verifyWebhook(event: VcsWebhookEvent, secret: string): Promise<boolean>;
  abstract parseWebhook(event: VcsWebhookEvent): Promise<VcsScanTrigger | null>;
  abstract fetchDiff(trigger: VcsScanTrigger): Promise<VcsDiffResult>;
  abstract reportStatus(trigger: VcsScanTrigger, report: VcsStatusReport): Promise<void>;
  abstract getInstallationToken(installationId: string): Promise<string>;

  rateLimitKey(installationId: string): string {
    return `vcs:ratelimit:${this.type}:${installationId}`;
  }

  correlationKey(scanId: string): string {
    return `scan:vcs:${this.type}:${scanId}`;
  }

  severityToLevel(severity: string): "notice" | "warning" | "failure" {
    switch (severity) {
      case "critical":
      case "high":
        return "failure";
      case "medium":
        return "warning";
      default:
        return "notice";
    }
  }

  formatAnnotations(findings: FindingInput[]): VcsAnnotation[] {
    return findings.slice(0, ANNOTATION_CAP).map((f) => ({
      file: f.file,
      lineStart: f.lineStart,
      lineEnd: f.lineEnd,
      level: this.severityToLevel(f.severity),
      title: f.title,
      message: f.description,
    }));
  }
}
```

Update `packages/vcs/src/index.ts` to add:

```typescript
export { VcsProviderBase } from "./base.js";
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/vcs/src/__tests__/base.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add packages/vcs/src/base.ts packages/vcs/src/__tests__/base.test.ts packages/vcs/src/index.ts
git commit -m "feat(vcs): add VcsProviderBase abstract class with shared infrastructure"
```

---

### Task 3: Database Migration — VcsInstallation + Extension Tables

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/YYYYMMDD_multi_vcs/migration.sql` (via prisma migrate)

**Context:** The existing `GitHubInstallation` model (`schema.prisma:313-325`) stores `installationId` (int), `orgId`, `owner`, `repo`, `permissions`. We add a generalized `VcsInstallation` table with a `provider` discriminant and per-provider extension tables for type-safe provider-specific fields. The existing `GitHubInstallation` table is kept temporarily for backwards compatibility during migration.

**Step 1: Add VcsInstallation and extension models to schema**

Add to `packages/db/prisma/schema.prisma`:

```prisma
model VcsInstallation {
  id             String   @id @default(uuid()) @db.Uuid
  orgId          String   @map("org_id") @db.Uuid
  provider       String                            // "github" | "gitlab" | "bitbucket" | "azure_devops"
  installationId String   @map("installation_id")  // provider-specific ID (string for all)
  owner          String                            // org/group/workspace
  repo           String?                           // null = org-level installation
  displayName    String?  @map("display_name")
  webhookSecret  String?  @map("webhook_secret")
  active         Boolean  @default(true)
  permissions    Json     @default("{}")
  metadata       Json     @default("{}")           // provider-specific config
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  organization Organization @relation(fields: [orgId], references: [id])

  @@unique([provider, installationId])
  @@index([orgId, provider])
  @@index([provider, owner])
  @@map("vcs_installations")
}

model VcsInstallationGitHub {
  id              String @id @default(uuid()) @db.Uuid
  vcsInstallationId String @unique @map("vcs_installation_id") @db.Uuid
  appId           String @map("app_id")
  numericInstallId Int   @map("numeric_install_id")  // GitHub uses int IDs
  privateKey      String @map("private_key")

  @@map("vcs_installation_github")
}

model VcsInstallationGitLab {
  id              String @id @default(uuid()) @db.Uuid
  vcsInstallationId String @unique @map("vcs_installation_id") @db.Uuid
  gitlabUrl       String @map("gitlab_url")  // self-hosted or gitlab.com
  accessToken     String @map("access_token")
  tokenType       String @map("token_type")  // "group" | "project" | "personal"

  @@map("vcs_installation_gitlab")
}

model VcsInstallationBitbucket {
  id              String @id @default(uuid()) @db.Uuid
  vcsInstallationId String @unique @map("vcs_installation_id") @db.Uuid
  workspace       String
  clientKey       String @map("client_key")
  sharedSecret    String @map("shared_secret")

  @@map("vcs_installation_bitbucket")
}

model VcsInstallationAzureDevOps {
  id              String @id @default(uuid()) @db.Uuid
  vcsInstallationId String @unique @map("vcs_installation_id") @db.Uuid
  organizationUrl String @map("organization_url")
  projectName     String @map("project_name")
  pat             String                          // Personal Access Token

  @@map("vcs_installation_azure_devops")
}
```

Also add the relation to `Organization`:

```prisma
// In Organization model, add:
vcsInstallations   VcsInstallation[]
```

**Step 2: Generate migration**

Run: `cd packages/db && npx prisma migrate dev --name multi_vcs_installations --create-only`
Expected: Migration SQL file created

**Step 3: Review and run migration**

Run: `npx prisma migrate dev`
Expected: Migration applied successfully

**Step 4: Verify Prisma client generated**

Run: `npx prisma generate`
Expected: Client generated with new models

**Step 5: Commit**

```bash
git add packages/db/prisma/
git commit -m "feat(db): add VcsInstallation table with per-provider extension tables"
```

---

### Task 4: GitLab Provider Implementation

**Files:**
- Create: `packages/vcs/src/providers/gitlab.ts`
- Create: `packages/vcs/src/__tests__/gitlab.test.ts`
- Modify: `packages/vcs/package.json` (add `@gitbeaker/rest` dependency)

**Context:** GitLab uses webhook tokens (not HMAC signatures — set a secret token in the webhook config, sent as `X-Gitlab-Token` header for direct comparison). Events: `Push Hook`, `Merge Request Hook`. Diff fetching: `GET /projects/:id/merge_requests/:iid/changes` or `GET /projects/:id/repository/compare?from=...&to=...`. Status reporting: Commit Status API (`POST /projects/:id/statuses/:sha`) + MR Notes (`POST /projects/:id/merge_requests/:iid/notes`). GitLab supports both gitlab.com and self-hosted instances.

**Step 1: Write the failing test**

Create `packages/vcs/src/__tests__/gitlab.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitLabProvider } from "../providers/gitlab.js";
import type { VcsWebhookEvent } from "../types.js";

// Mock @gitbeaker/rest
vi.mock("@gitbeaker/rest", () => ({
  Gitlab: vi.fn().mockImplementation(() => ({
    MergeRequests: {
      allDiffs: vi.fn().mockResolvedValue([
        { diff: "--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n+new line", new_path: "file.ts", renamed_file: false, deleted_file: false, new_file: false },
      ]),
    },
    Repositories: {
      compare: vi.fn().mockResolvedValue({
        diffs: [{ diff: "--- a/main.ts\n+++ b/main.ts\n@@ -1 +1 @@\n-old\n+new", new_path: "main.ts", renamed_file: false, deleted_file: false, new_file: false }],
      }),
    },
    Commits: {
      editStatus: vi.fn().mockResolvedValue({}),
    },
    MergeRequestNotes: {
      create: vi.fn().mockResolvedValue({}),
    },
  })),
}));

describe("GitLabProvider", () => {
  let provider: GitLabProvider;

  beforeEach(() => {
    provider = new GitLabProvider({ host: "https://gitlab.com", token: "glpat-test" });
  });

  it("has correct type and name", () => {
    expect(provider.type).toBe("gitlab");
    expect(provider.name).toBe("GitLab");
  });

  it("capabilities: no checkRuns, yes commitStatus + prComments", () => {
    expect(provider.capabilities.checkRuns).toBe(false);
    expect(provider.capabilities.commitStatus).toBe(true);
    expect(provider.capabilities.prComments).toBe(true);
    expect(provider.capabilities.prAnnotations).toBe(false);
  });

  describe("verifyWebhook", () => {
    it("returns true when X-Gitlab-Token matches secret", async () => {
      const event: VcsWebhookEvent = {
        provider: "gitlab",
        headers: { "x-gitlab-token": "my-secret" },
        body: {},
        rawBody: "{}",
      };
      expect(await provider.verifyWebhook(event, "my-secret")).toBe(true);
    });

    it("returns false when token does not match", async () => {
      const event: VcsWebhookEvent = {
        provider: "gitlab",
        headers: { "x-gitlab-token": "wrong" },
        body: {},
        rawBody: "{}",
      };
      expect(await provider.verifyWebhook(event, "my-secret")).toBe(false);
    });

    it("returns false when header missing", async () => {
      const event: VcsWebhookEvent = {
        provider: "gitlab",
        headers: {},
        body: {},
        rawBody: "{}",
      };
      expect(await provider.verifyWebhook(event, "my-secret")).toBe(false);
    });
  });

  describe("parseWebhook", () => {
    it("parses push hook", async () => {
      const event: VcsWebhookEvent = {
        provider: "gitlab",
        headers: { "x-gitlab-event": "Push Hook" },
        body: {
          project: { id: 123, path_with_namespace: "mygroup/myrepo", namespace: "mygroup" },
          ref: "refs/heads/main",
          checkout_sha: "abc123",
          user_email: "user@example.com",
          commits: [{ id: "abc123" }],
        },
        rawBody: "{}",
      };
      const trigger = await provider.parseWebhook(event);
      expect(trigger).not.toBeNull();
      expect(trigger!.provider).toBe("gitlab");
      expect(trigger!.type).toBe("push");
      expect(trigger!.commitHash).toBe("abc123");
      expect(trigger!.repo).toBe("mygroup/myrepo");
      expect(trigger!.branch).toBe("main");
    });

    it("parses merge request hook (opened)", async () => {
      const event: VcsWebhookEvent = {
        provider: "gitlab",
        headers: { "x-gitlab-event": "Merge Request Hook" },
        body: {
          object_attributes: {
            iid: 42,
            action: "open",
            source_branch: "feature-x",
            last_commit: { id: "def456" },
            target_project_id: 123,
          },
          project: { id: 123, path_with_namespace: "mygroup/myrepo", namespace: "mygroup" },
          user: { email: "dev@example.com" },
        },
        rawBody: "{}",
      };
      const trigger = await provider.parseWebhook(event);
      expect(trigger).not.toBeNull();
      expect(trigger!.type).toBe("merge_request");
      expect(trigger!.prNumber).toBe(42);
      expect(trigger!.commitHash).toBe("def456");
    });

    it("ignores merge request close action", async () => {
      const event: VcsWebhookEvent = {
        provider: "gitlab",
        headers: { "x-gitlab-event": "Merge Request Hook" },
        body: {
          object_attributes: { action: "close", iid: 42 },
          project: { id: 123, path_with_namespace: "mygroup/myrepo", namespace: "mygroup" },
          user: { email: "dev@example.com" },
        },
        rawBody: "{}",
      };
      const trigger = await provider.parseWebhook(event);
      expect(trigger).toBeNull();
    });

    it("returns null for unknown event", async () => {
      const event: VcsWebhookEvent = {
        provider: "gitlab",
        headers: { "x-gitlab-event": "Note Hook" },
        body: {},
        rawBody: "{}",
      };
      expect(await provider.parseWebhook(event)).toBeNull();
    });
  });

  describe("fetchDiff", () => {
    it("fetches merge request diff", async () => {
      const result = await provider.fetchDiff({
        provider: "gitlab",
        type: "merge_request",
        installationId: "inst-1",
        repo: "mygroup/myrepo",
        owner: "mygroup",
        commitHash: "abc",
        branch: "feature",
        author: "dev",
        prNumber: 42,
        projectId: 123,
      });
      expect(result.rawDiff).toContain("file.ts");
      expect(result.files).toHaveLength(1);
      expect(result.files[0].status).toBe("modified");
    });

    it("fetches push diff via compare", async () => {
      const result = await provider.fetchDiff({
        provider: "gitlab",
        type: "push",
        installationId: "inst-1",
        repo: "mygroup/myrepo",
        owner: "mygroup",
        commitHash: "abc123",
        branch: "main",
        author: "dev",
        projectId: 123,
      });
      expect(result.rawDiff).toContain("main.ts");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/vcs/src/__tests__/gitlab.test.ts`
Expected: FAIL — `../providers/gitlab.js` does not exist

**Step 3: Add dependency and implement**

Add `@gitbeaker/rest` to `packages/vcs/package.json` dependencies.

Create `packages/vcs/src/providers/gitlab.ts`:

```typescript
import { Gitlab } from "@gitbeaker/rest";
import { timingSafeEqual } from "node:crypto";
import { VcsProviderBase } from "../base.js";
import type {
  VcsCapabilities,
  VcsScanTrigger,
  VcsWebhookEvent,
  VcsDiffResult,
  VcsStatusReport,
  VcsProviderType,
} from "../types.js";

const RELEVANT_MR_ACTIONS = new Set(["open", "reopen", "update"]);

interface GitLabProviderOpts {
  host: string;
  token: string;
}

export class GitLabProvider extends VcsProviderBase {
  readonly name = "GitLab";
  readonly type: VcsProviderType = "gitlab";
  readonly capabilities: VcsCapabilities = {
    checkRuns: false,
    commitStatus: true,
    prComments: true,
    prAnnotations: false,
    webhookSignatureVerification: true,
    appInstallations: false,
  };

  private client: InstanceType<typeof Gitlab>;

  constructor(opts: GitLabProviderOpts) {
    super();
    this.client = new Gitlab({ host: opts.host, token: opts.token });
  }

  async verifyWebhook(event: VcsWebhookEvent, secret: string): Promise<boolean> {
    const token = event.headers["x-gitlab-token"];
    if (!token || token.length !== secret.length) return false;
    return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
  }

  async parseWebhook(event: VcsWebhookEvent): Promise<VcsScanTrigger | null> {
    const eventType = event.headers["x-gitlab-event"];
    const body = event.body as any;

    if (eventType === "Push Hook") {
      return this.parsePushHook(body);
    }
    if (eventType === "Merge Request Hook") {
      return this.parseMergeRequestHook(body);
    }
    return null;
  }

  async fetchDiff(trigger: VcsScanTrigger): Promise<VcsDiffResult> {
    const projectId = trigger.projectId!;

    if (trigger.type === "merge_request" && trigger.prNumber) {
      const diffs = await this.client.MergeRequests.allDiffs(projectId, trigger.prNumber);
      return this.buildDiffResult(diffs as any[]);
    }

    // Push — compare parent to HEAD
    const result = await this.client.Repositories.compare(
      projectId,
      `${trigger.commitHash}~1`,
      trigger.commitHash,
    );
    return this.buildDiffResult((result as any).diffs ?? []);
  }

  async reportStatus(trigger: VcsScanTrigger, report: VcsStatusReport): Promise<void> {
    const projectId = trigger.projectId!;
    const state = this.mapStatusToGitLabState(report.status);

    // 1. Commit status
    await this.client.Commits.editStatus(projectId, trigger.commitHash, {
      state,
      name: "SENTINEL Compliance Scan",
      description: report.summary.slice(0, 255),
      target_url: report.detailsUrl,
    } as any);

    // 2. MR comment with findings summary (if MR)
    if (trigger.prNumber && report.annotations.length > 0) {
      const body = this.buildMrComment(report);
      await this.client.MergeRequestNotes.create(projectId, trigger.prNumber, body);
    }
  }

  async getInstallationToken(_installationId: string): Promise<string> {
    // GitLab uses project/group access tokens — already configured at construction
    return "configured-at-init";
  }

  // ── Private helpers ──

  private parsePushHook(body: any): VcsScanTrigger | null {
    const ref = body.ref as string;
    if (!ref?.startsWith("refs/heads/")) return null;
    const commitSha = body.checkout_sha ?? body.commits?.[0]?.id;
    if (!commitSha) return null;

    return {
      provider: "gitlab",
      type: "push",
      installationId: String(body.project.id),
      repo: body.project.path_with_namespace,
      owner: body.project.namespace,
      commitHash: commitSha,
      branch: ref.replace("refs/heads/", ""),
      author: body.user_email ?? "unknown",
      projectId: body.project.id,
    };
  }

  private parseMergeRequestHook(body: any): VcsScanTrigger | null {
    const attrs = body.object_attributes;
    if (!attrs || !RELEVANT_MR_ACTIONS.has(attrs.action)) return null;

    return {
      provider: "gitlab",
      type: "merge_request",
      installationId: String(body.project.id),
      repo: body.project.path_with_namespace,
      owner: body.project.namespace,
      commitHash: attrs.last_commit?.id ?? "",
      branch: attrs.source_branch,
      author: body.user?.email ?? "unknown",
      prNumber: attrs.iid,
      projectId: body.project.id,
    };
  }

  private buildDiffResult(diffs: any[]): VcsDiffResult {
    const parts: string[] = [];
    const files: VcsDiffResult["files"] = [];

    for (const d of diffs) {
      if (d.diff) {
        parts.push(`diff --git a/${d.new_path} b/${d.new_path}\n${d.diff}`);
      }
      files.push({
        path: d.new_path,
        status: d.new_file ? "added" : d.deleted_file ? "deleted" : d.renamed_file ? "renamed" : "modified",
      });
    }

    return { rawDiff: parts.join("\n"), files };
  }

  private mapStatusToGitLabState(status: string): string {
    switch (status) {
      case "full_pass": return "success";
      case "provisional_pass": return "success";
      case "partial": return "pending";
      case "fail":
      case "revoked": return "failed";
      default: return "failed";
    }
  }

  private buildMrComment(report: VcsStatusReport): string {
    const lines = [
      `## SENTINEL Compliance Scan`,
      `**Status:** ${report.status.replace(/_/g, " ")} | **Risk:** ${report.riskScore}/100`,
      `**Findings:** ${report.annotations.length}`,
      "",
    ];
    for (const a of report.annotations.slice(0, 20)) {
      lines.push(`- **${a.level}** \`${a.file}:${a.lineStart}\` — ${a.title}`);
    }
    if (report.annotations.length > 20) {
      lines.push(`\n_...and ${report.annotations.length - 20} more findings_`);
    }
    return lines.join("\n");
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm install && npx vitest run packages/vcs/src/__tests__/gitlab.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add packages/vcs/
git commit -m "feat(vcs): add GitLab provider with webhook parsing, diff fetching, and MR comments"
```

---

### Task 5: Bitbucket Provider Implementation

**Files:**
- Create: `packages/vcs/src/providers/bitbucket.ts`
- Create: `packages/vcs/src/__tests__/bitbucket.test.ts`
- Modify: `packages/vcs/package.json` (add `bitbucket` dependency)

**Context:** Bitbucket Cloud uses HMAC-SHA256 signatures (`X-Hub-Signature` header, same as GitHub). Events: `repo:push`, `pullrequest:created`, `pullrequest:updated`. Diff: `GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{id}/diff` or `GET /2.0/repositories/{workspace}/{repo_slug}/diff/{spec}`. Status: Build Status API (`POST /2.0/repositories/{workspace}/{repo_slug}/commit/{node}/statuses/build`) + PR comments (`POST /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{id}/comments`).

**Step 1: Write the failing test**

Create `packages/vcs/src/__tests__/bitbucket.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BitbucketProvider } from "../providers/bitbucket.js";
import type { VcsWebhookEvent } from "../types.js";

// Mock fetch for Bitbucket REST API
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("BitbucketProvider", () => {
  let provider: BitbucketProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new BitbucketProvider({
      workspace: "myworkspace",
      appPassword: "test-pass",
      username: "test-user",
    });
  });

  it("has correct type and capabilities", () => {
    expect(provider.type).toBe("bitbucket");
    expect(provider.capabilities.checkRuns).toBe(false);
    expect(provider.capabilities.commitStatus).toBe(true);
    expect(provider.capabilities.prComments).toBe(true);
  });

  describe("verifyWebhook", () => {
    it("verifies HMAC-SHA256 signature", async () => {
      // Bitbucket sends X-Hub-Signature
      const crypto = await import("node:crypto");
      const secret = "webhook-secret";
      const body = '{"push":{"changes":[]}}';
      const sig = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

      const event: VcsWebhookEvent = {
        provider: "bitbucket",
        headers: { "x-hub-signature": sig },
        body: JSON.parse(body),
        rawBody: body,
      };
      expect(await provider.verifyWebhook(event, secret)).toBe(true);
    });

    it("rejects invalid signature", async () => {
      const event: VcsWebhookEvent = {
        provider: "bitbucket",
        headers: { "x-hub-signature": "sha256=invalid" },
        body: {},
        rawBody: "{}",
      };
      expect(await provider.verifyWebhook(event, "secret")).toBe(false);
    });
  });

  describe("parseWebhook", () => {
    it("parses repo:push event", async () => {
      const event: VcsWebhookEvent = {
        provider: "bitbucket",
        headers: { "x-event-key": "repo:push" },
        body: {
          repository: {
            full_name: "myworkspace/myrepo",
            workspace: { slug: "myworkspace" },
          },
          push: {
            changes: [{
              new: {
                type: "branch",
                name: "main",
                target: { hash: "abc123", author: { raw: "Dev <dev@example.com>" } },
              },
            }],
          },
        },
        rawBody: "{}",
      };
      const trigger = await provider.parseWebhook(event);
      expect(trigger).not.toBeNull();
      expect(trigger!.provider).toBe("bitbucket");
      expect(trigger!.type).toBe("push");
      expect(trigger!.commitHash).toBe("abc123");
    });

    it("parses pullrequest:created event", async () => {
      const event: VcsWebhookEvent = {
        provider: "bitbucket",
        headers: { "x-event-key": "pullrequest:created" },
        body: {
          repository: {
            full_name: "myworkspace/myrepo",
            workspace: { slug: "myworkspace" },
          },
          pullrequest: {
            id: 99,
            source: {
              branch: { name: "feature-y" },
              commit: { hash: "def456" },
            },
            author: { display_name: "Dev User" },
          },
        },
        rawBody: "{}",
      };
      const trigger = await provider.parseWebhook(event);
      expect(trigger!.type).toBe("pull_request");
      expect(trigger!.prNumber).toBe(99);
    });

    it("returns null for irrelevant event", async () => {
      const event: VcsWebhookEvent = {
        provider: "bitbucket",
        headers: { "x-event-key": "repo:fork" },
        body: {},
        rawBody: "{}",
      };
      expect(await provider.parseWebhook(event)).toBeNull();
    });
  });

  describe("fetchDiff", () => {
    it("fetches PR diff from Bitbucket API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new"),
      });

      const result = await provider.fetchDiff({
        provider: "bitbucket",
        type: "pull_request",
        installationId: "inst-1",
        repo: "myworkspace/myrepo",
        owner: "myworkspace",
        commitHash: "abc",
        branch: "feature",
        author: "dev",
        prNumber: 99,
      });
      expect(result.rawDiff).toContain("file.ts");
    });
  });

  describe("reportStatus", () => {
    it("posts build status to commit", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

      await provider.reportStatus(
        {
          provider: "bitbucket",
          type: "push",
          installationId: "inst-1",
          repo: "myworkspace/myrepo",
          owner: "myworkspace",
          commitHash: "abc",
          branch: "main",
          author: "dev",
        },
        {
          scanId: "scan-1",
          commitHash: "abc",
          status: "full_pass",
          riskScore: 10,
          summary: "All good",
          annotations: [],
        },
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/commit/abc/statuses/build");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/vcs/src/__tests__/bitbucket.test.ts`
Expected: FAIL — `../providers/bitbucket.js` does not exist

**Step 3: Implement BitbucketProvider**

Create `packages/vcs/src/providers/bitbucket.ts` implementing the VcsProviderBase with:
- HMAC-SHA256 webhook verification (same algo as GitHub, header `X-Hub-Signature`)
- Push + PR webhook parsing
- Diff fetch via Bitbucket REST 2.0 API (native `fetch`)
- Build Status API for commit status
- PR comments for findings

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/vcs/src/__tests__/bitbucket.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/vcs/src/providers/bitbucket.ts packages/vcs/src/__tests__/bitbucket.test.ts
git commit -m "feat(vcs): add Bitbucket Cloud provider with webhook parsing and build status"
```

---

### Task 6: Azure DevOps Provider Implementation

**Files:**
- Create: `packages/vcs/src/providers/azure-devops.ts`
- Create: `packages/vcs/src/__tests__/azure-devops.test.ts`
- Modify: `packages/vcs/package.json` (add `azure-devops-node-api`)

**Context:** Azure DevOps uses HTTP Basic Auth or Service Hook subscriptions with shared secret. Events: `git.push`, `git.pullrequest.created`, `git.pullrequest.updated`. Diff: REST API `/git/repositories/{repo}/diffs/commits?baseVersion=...&targetVersion=...`. Status: Git Status API (`POST /git/repositories/{repo}/commits/{commitId}/statuses`) + PR comments threads (`POST /git/repositories/{repo}/pullRequests/{id}/threads`). Azure DevOps has both cloud (dev.azure.com) and Server (on-prem) variants.

**Step 1: Write the failing test**

Create `packages/vcs/src/__tests__/azure-devops.test.ts` with tests for:
- Provider type and capabilities (no checkRuns, yes commitStatus + prComments)
- Webhook verification (HMAC-SHA256 via shared secret, or HTTP Basic Auth header)
- Parse `git.push` event
- Parse `git.pullrequest.created` and `git.pullrequest.updated`
- Ignore irrelevant events
- Diff fetching
- Status reporting to commit status API

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/vcs/src/__tests__/azure-devops.test.ts`
Expected: FAIL

**Step 3: Implement AzureDevOpsProvider**

Create `packages/vcs/src/providers/azure-devops.ts` implementing VcsProviderBase with:
- Service Hook webhook verification
- Push + PR webhook parsing (Azure's webhook payload structure differs significantly)
- Diff fetch via Azure DevOps REST API
- Git commit status for results
- PR comment threads for findings

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/vcs/src/__tests__/azure-devops.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/vcs/src/providers/azure-devops.ts packages/vcs/src/__tests__/azure-devops.test.ts
git commit -m "feat(vcs): add Azure DevOps provider with service hooks and PR threads"
```

---

### Task 7: Refactor GitHub Into VcsProvider Pattern

**Files:**
- Create: `packages/vcs/src/providers/github.ts`
- Create: `packages/vcs/src/__tests__/github-provider.test.ts`
- Modify: `packages/vcs/src/index.ts`

**Context:** The existing GitHub integration lives in `packages/github/` and `apps/api/src/github/`. We create a `GitHubProvider` class in `packages/vcs/` that wraps the existing `@sentinel/github` functions (parseWebhookEvent, verifyWebhookSignature, buildCheckRunCreate/Complete, findingsToAnnotations) into the VcsProvider interface. The existing `packages/github/` package stays unchanged — `GitHubProvider` delegates to it. This is the adapter pattern: new interface, same implementation.

**Step 1: Write the failing test**

Create `packages/vcs/src/__tests__/github-provider.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitHubProvider } from "../providers/github.js";
import type { VcsWebhookEvent } from "../types.js";

vi.mock("@sentinel/github", () => ({
  verifyWebhookSignature: vi.fn().mockReturnValue(true),
  parseWebhookEvent: vi.fn().mockReturnValue({
    type: "pull_request",
    installationId: 12345,
    repo: "owner/repo",
    owner: "owner",
    commitHash: "sha123",
    branch: "feature",
    author: "dev",
    prNumber: 42,
  }),
  getInstallationOctokit: vi.fn().mockReturnValue({
    rest: {
      pulls: { get: vi.fn().mockResolvedValue({ data: "diff content" }) },
      checks: { create: vi.fn().mockResolvedValue({ data: { id: 1 } }), update: vi.fn() },
    },
  }),
  buildCheckRunComplete: vi.fn().mockReturnValue({
    name: "SENTINEL",
    head_sha: "",
    status: "completed",
    conclusion: "success",
    output: { title: "SENTINEL: FULL PASS", summary: "ok" },
  }),
  findingsToAnnotations: vi.fn().mockReturnValue([]),
}));

describe("GitHubProvider", () => {
  let provider: GitHubProvider;

  beforeEach(() => {
    provider = new GitHubProvider({ appId: "123", privateKey: "pk" });
  });

  it("has correct type and capabilities", () => {
    expect(provider.type).toBe("github");
    expect(provider.capabilities.checkRuns).toBe(true);
    expect(provider.capabilities.prAnnotations).toBe(true);
    expect(provider.capabilities.appInstallations).toBe(true);
  });

  it("delegates verifyWebhook to @sentinel/github", async () => {
    const event: VcsWebhookEvent = {
      provider: "github",
      headers: { "x-hub-signature-256": "sha256=abc" },
      body: {},
      rawBody: "{}",
    };
    const result = await provider.verifyWebhook(event, "secret");
    expect(result).toBe(true);
  });

  it("delegates parseWebhook to @sentinel/github", async () => {
    const event: VcsWebhookEvent = {
      provider: "github",
      headers: { "x-github-event": "pull_request" },
      body: { action: "opened" },
      rawBody: "{}",
    };
    const trigger = await provider.parseWebhook(event);
    expect(trigger).not.toBeNull();
    expect(trigger!.provider).toBe("github");
    expect(trigger!.type).toBe("pull_request");
  });

  it("converts ScanTrigger installationId from number to string", async () => {
    const event: VcsWebhookEvent = {
      provider: "github",
      headers: { "x-github-event": "pull_request" },
      body: {},
      rawBody: "{}",
    };
    const trigger = await provider.parseWebhook(event);
    expect(typeof trigger!.installationId).toBe("string");
    expect(trigger!.installationId).toBe("12345");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/vcs/src/__tests__/github-provider.test.ts`
Expected: FAIL

**Step 3: Implement GitHubProvider**

Create `packages/vcs/src/providers/github.ts` that:
- Wraps `verifyWebhookSignature` from `@sentinel/github`
- Wraps `parseWebhookEvent` and converts the result to `VcsScanTrigger` (adding `provider: "github"`, converting `installationId` number to string)
- Wraps `getInstallationOctokit` + `fetchDiff` for diff fetching
- Uses `buildCheckRunComplete` + `findingsToAnnotations` for status reporting (Check Runs)
- Adds `@sentinel/github` as a dependency of `@sentinel/vcs`

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/vcs/src/__tests__/github-provider.test.ts`
Expected: PASS

**Step 5: Export all providers from index and commit**

Update `packages/vcs/src/index.ts`:

```typescript
export { GitHubProvider } from "./providers/github.js";
export { GitLabProvider } from "./providers/gitlab.js";
export { BitbucketProvider } from "./providers/bitbucket.js";
export { AzureDevOpsProvider } from "./providers/azure-devops.js";
```

```bash
git add packages/vcs/
git commit -m "feat(vcs): add GitHubProvider adapter wrapping existing @sentinel/github package"
```

---

### Task 8: Provider Registry and VCS Bridge Service

**Files:**
- Create: `packages/vcs/src/registry.ts`
- Create: `packages/vcs/src/__tests__/registry.test.ts`
- Create: `apps/api/src/vcs-bridge.ts`

**Context:** The existing `apps/api/src/github-bridge.ts` runs as a standalone process consuming `sentinel.scan-triggers` and `sentinel.results`. We create a generalized `vcs-bridge.ts` that uses a provider registry to dispatch to the correct provider. The registry is a simple `Map<VcsProviderType, VcsProvider>` populated at startup from environment variables.

**Step 1: Write the failing test for registry**

Create `packages/vcs/src/__tests__/registry.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { VcsProviderRegistry } from "../registry.js";
import type { VcsProvider, VcsProviderType } from "../types.js";

const mockProvider = (type: VcsProviderType): VcsProvider => ({
  name: type,
  type,
  capabilities: {
    checkRuns: false,
    commitStatus: true,
    prComments: true,
    prAnnotations: false,
    webhookSignatureVerification: true,
    appInstallations: false,
  },
  verifyWebhook: async () => true,
  parseWebhook: async () => null,
  fetchDiff: async () => ({ rawDiff: "", files: [] }),
  reportStatus: async () => {},
  getInstallationToken: async () => "token",
});

describe("VcsProviderRegistry", () => {
  let registry: VcsProviderRegistry;

  beforeEach(() => {
    registry = new VcsProviderRegistry();
  });

  it("registers and retrieves a provider", () => {
    const provider = mockProvider("gitlab");
    registry.register(provider);
    expect(registry.get("gitlab")).toBe(provider);
  });

  it("returns undefined for unregistered provider", () => {
    expect(registry.get("bitbucket")).toBeUndefined();
  });

  it("lists registered providers", () => {
    registry.register(mockProvider("github"));
    registry.register(mockProvider("gitlab"));
    expect(registry.list()).toEqual(["github", "gitlab"]);
  });

  it("throws on duplicate registration", () => {
    registry.register(mockProvider("github"));
    expect(() => registry.register(mockProvider("github"))).toThrow("already registered");
  });

  it("has() returns correct boolean", () => {
    registry.register(mockProvider("github"));
    expect(registry.has("github")).toBe(true);
    expect(registry.has("gitlab")).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/vcs/src/__tests__/registry.test.ts`
Expected: FAIL

**Step 3: Implement registry**

Create `packages/vcs/src/registry.ts`:

```typescript
import type { VcsProvider, VcsProviderType } from "./types.js";

export class VcsProviderRegistry {
  private providers = new Map<VcsProviderType, VcsProvider>();

  register(provider: VcsProvider): void {
    if (this.providers.has(provider.type)) {
      throw new Error(`Provider ${provider.type} already registered`);
    }
    this.providers.set(provider.type, provider);
  }

  get(type: VcsProviderType): VcsProvider | undefined {
    return this.providers.get(type);
  }

  has(type: VcsProviderType): boolean {
    return this.providers.has(type);
  }

  list(): VcsProviderType[] {
    return [...this.providers.keys()];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/vcs/src/__tests__/registry.test.ts`
Expected: PASS

**Step 5: Create vcs-bridge.ts**

Create `apps/api/src/vcs-bridge.ts` modeled on `github-bridge.ts` but provider-aware:
- At startup, read env vars to determine which providers to enable
- Register each enabled provider in the `VcsProviderRegistry`
- Consume `sentinel.scan-triggers` — read `provider` field from trigger, dispatch to correct provider for diff fetching
- Consume `sentinel.results` — look up provider from correlation key or DB `triggerMeta`, dispatch to correct provider for status reporting
- Health server on configurable port

**Step 6: Commit**

```bash
git add packages/vcs/src/registry.ts packages/vcs/src/__tests__/registry.test.ts apps/api/src/vcs-bridge.ts
git commit -m "feat(vcs): add provider registry and generalized vcs-bridge service"
```

---

### Task 9: Multi-Provider Webhook Routes

**Files:**
- Create: `apps/api/src/routes/vcs-webhooks.ts`
- Create: `apps/api/src/__tests__/vcs-webhooks.test.ts`

**Context:** The existing webhook route (`apps/api/src/routes/webhooks.ts`) handles only GitHub (`POST /webhooks/github`). We add per-provider routes: `POST /webhooks/gitlab`, `POST /webhooks/bitbucket`, `POST /webhooks/azure-devops`. Each route delegates signature verification and parsing to the VcsProvider from the registry. The lookup of `VcsInstallation` replaces the current `gitHubInstallation.findUnique()`.

**Step 1: Write the failing test**

Create `apps/api/src/__tests__/vcs-webhooks.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { registerVcsWebhookRoutes } from "../routes/vcs-webhooks.js";

const mockProvider = {
  type: "gitlab" as const,
  verifyWebhook: vi.fn().mockResolvedValue(true),
  parseWebhook: vi.fn().mockResolvedValue({
    provider: "gitlab",
    type: "push",
    installationId: "123",
    repo: "group/repo",
    owner: "group",
    commitHash: "abc",
    branch: "main",
    author: "dev@example.com",
  }),
};

const mockRegistry = {
  get: vi.fn().mockReturnValue(mockProvider),
  has: vi.fn().mockReturnValue(true),
  list: vi.fn().mockReturnValue(["gitlab"]),
};

const mockEventBus = { publish: vi.fn().mockResolvedValue(undefined) };
const mockDb = {
  vcsInstallation: {
    findFirst: vi.fn().mockResolvedValue({
      id: "inst-1",
      orgId: "org-1",
      provider: "gitlab",
      webhookSecret: "my-secret",
    }),
  },
};

describe("VCS webhook routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    registerVcsWebhookRoutes(app, {
      registry: mockRegistry as any,
      eventBus: mockEventBus as any,
      db: mockDb as any,
    });
    await app.ready();
  });

  it("POST /webhooks/gitlab accepts valid webhook", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/gitlab",
      headers: { "x-gitlab-token": "my-secret", "x-gitlab-event": "Push Hook" },
      payload: { project: { id: 123 } },
    });
    expect(res.statusCode).toBe(202);
    expect(mockEventBus.publish).toHaveBeenCalledWith(
      "sentinel.scan-triggers",
      expect.objectContaining({ provider: "gitlab", orgId: "org-1" }),
    );
  });

  it("returns 404 for unregistered provider", async () => {
    mockRegistry.has.mockReturnValueOnce(false);
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/unknown",
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 401 for failed signature verification", async () => {
    mockProvider.verifyWebhook.mockResolvedValueOnce(false);
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/gitlab",
      headers: { "x-gitlab-token": "wrong" },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 ignored for irrelevant events", async () => {
    mockProvider.parseWebhook.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/gitlab",
      headers: { "x-gitlab-token": "my-secret" },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ignored: true });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/__tests__/vcs-webhooks.test.ts`
Expected: FAIL

**Step 3: Implement multi-provider webhook routes**

Create `apps/api/src/routes/vcs-webhooks.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import type { EventBus } from "@sentinel/events";
import type { VcsProviderRegistry } from "@sentinel/vcs";
import type { VcsProviderType } from "@sentinel/vcs";

interface VcsWebhookOpts {
  registry: VcsProviderRegistry;
  eventBus: EventBus;
  db: any;
}

const PROVIDER_SLUGS: VcsProviderType[] = ["github", "gitlab", "bitbucket", "azure_devops"];

// Map URL slug to provider type (azure-devops -> azure_devops)
function slugToType(slug: string): VcsProviderType | undefined {
  const map: Record<string, VcsProviderType> = {
    github: "github",
    gitlab: "gitlab",
    bitbucket: "bitbucket",
    "azure-devops": "azure_devops",
  };
  return map[slug];
}

export function registerVcsWebhookRoutes(
  app: FastifyInstance,
  opts: VcsWebhookOpts,
): void {
  app.post<{ Params: { provider: string } }>(
    "/webhooks/:provider",
    { config: { rateLimit: false } },
    async (request, reply) => {
      const providerType = slugToType(request.params.provider);
      if (!providerType || !opts.registry.has(providerType)) {
        reply.code(404).send({ error: "Unknown VCS provider" });
        return;
      }

      const provider = opts.registry.get(providerType)!;
      const rawBody = typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body);

      // Look up installation to get webhook secret
      // For initial webhook, we try matching by provider + headers
      const installation = await opts.db.vcsInstallation.findFirst({
        where: { provider: providerType, active: true },
      });

      const secret = installation?.webhookSecret ?? "";

      const event = {
        provider: providerType,
        headers: request.headers as Record<string, string>,
        body: typeof request.body === "string" ? JSON.parse(request.body) : request.body,
        rawBody,
      };

      if (!await provider.verifyWebhook(event, secret)) {
        reply.code(401).send({ error: "Invalid webhook signature" });
        return;
      }

      const trigger = await provider.parseWebhook(event);
      if (!trigger) {
        reply.code(200).send({ ignored: true });
        return;
      }

      if (!installation) {
        reply.code(404).send({ error: "Unknown VCS installation" });
        return;
      }

      await opts.eventBus.publish("sentinel.scan-triggers", {
        ...trigger,
        orgId: installation.orgId,
      });

      reply.code(202).send({
        accepted: true,
        repo: trigger.repo,
        commit: trigger.commitHash,
      });
    },
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run apps/api/src/__tests__/vcs-webhooks.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/vcs-webhooks.ts apps/api/src/__tests__/vcs-webhooks.test.ts
git commit -m "feat(api): add multi-provider VCS webhook routes"
```

---

### Task 10: Generalized Results Reporting

**Files:**
- Create: `apps/api/src/vcs/results-consumer.ts`
- Create: `apps/api/src/__tests__/vcs-results-consumer.test.ts`

**Context:** The existing `apps/api/src/github/results-consumer.ts` handles only GitHub Check Runs. The generalized version looks up the provider from correlation data, then delegates to `provider.reportStatus()`. Each provider's `reportStatus()` uses the appropriate method (GitHub: Check Run update, GitLab: commit status + MR note, Bitbucket: build status + PR comment, Azure DevOps: git status + PR thread).

**Step 1: Write the failing test**

Tests should verify:
- Looks up provider from Redis correlation key (fast path)
- Falls back to DB `triggerMeta.provider` when Redis miss
- Delegates to the correct provider's `reportStatus()`
- Skips gracefully when no VCS context (CLI/API scan)
- Cleans up Redis correlation after reporting

**Step 2: Run test to verify it fails**

**Step 3: Implement generalized results consumer**

Create `apps/api/src/vcs/results-consumer.ts` that:
- Reads `provider` from Redis correlation hash
- Gets provider instance from registry
- Loads findings from DB, formats into `VcsStatusReport`
- Calls `provider.reportStatus()`
- Cleans up Redis

**Step 4: Run test to verify it passes**

**Step 5: Commit**

```bash
git add apps/api/src/vcs/
git commit -m "feat(vcs): add generalized results consumer with provider-aware status reporting"
```

---

### Task 11: Provider-Aware Rate Limiting

**Files:**
- Create: `packages/vcs/src/rate-limiter.ts`
- Create: `packages/vcs/src/__tests__/rate-limiter.test.ts`

**Context:** The existing rate limiter (`apps/api/src/github/rate-limiter.ts`) uses a fixed 4500/hr limit for GitHub. Different providers have different rate limits: GitHub (5000/hr), GitLab (varies, ~600/min for gitlab.com), Bitbucket (1000/hr), Azure DevOps (varies). The generalized rate limiter uses `VcsProviderBase.rateLimitKey()` and configurable limits per provider.

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VcsRateLimiter } from "../rate-limiter.js";

const mockRedis = {
  incr: vi.fn(),
  expire: vi.fn(),
};

describe("VcsRateLimiter", () => {
  let limiter: VcsRateLimiter;

  beforeEach(() => {
    vi.clearAllMocks();
    limiter = new VcsRateLimiter(mockRedis as any);
  });

  it("allows request under limit", async () => {
    mockRedis.incr.mockResolvedValue(1);
    const ok = await limiter.check("github", "inst-1");
    expect(ok).toBe(true);
    expect(mockRedis.expire).toHaveBeenCalled();
  });

  it("rejects request over GitHub limit (4500)", async () => {
    mockRedis.incr.mockResolvedValue(4501);
    const ok = await limiter.check("github", "inst-1");
    expect(ok).toBe(false);
  });

  it("uses correct key format", async () => {
    mockRedis.incr.mockResolvedValue(1);
    await limiter.check("gitlab", "proj-42");
    expect(mockRedis.incr).toHaveBeenCalledWith("vcs:ratelimit:gitlab:proj-42");
  });

  it("uses provider-specific limits", async () => {
    mockRedis.incr.mockResolvedValue(601);
    const ok = await limiter.check("gitlab", "proj-1");
    expect(ok).toBe(false); // GitLab limit: 600/hr
  });

  it("uses Bitbucket limit (1000)", async () => {
    mockRedis.incr.mockResolvedValue(999);
    expect(await limiter.check("bitbucket", "ws-1")).toBe(true);
    mockRedis.incr.mockResolvedValue(1001);
    expect(await limiter.check("bitbucket", "ws-1")).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Implement VcsRateLimiter**

```typescript
import type { Redis } from "ioredis";
import type { VcsProviderType } from "./types.js";

const WINDOW_SECONDS = 3600;

const LIMITS: Record<VcsProviderType, number> = {
  github: 4500,        // 5000/hr with 500 buffer
  gitlab: 600,         // gitlab.com: ~10/sec, conservative hourly
  bitbucket: 1000,     // Bitbucket Cloud: 1000/hr
  azure_devops: 2000,  // Azure DevOps: varies, conservative
};

export class VcsRateLimiter {
  constructor(private redis: Redis) {}

  async check(provider: VcsProviderType, installationId: string): Promise<boolean> {
    const key = `vcs:ratelimit:${provider}:${installationId}`;
    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, WINDOW_SECONDS);
    }
    return current <= (LIMITS[provider] ?? 1000);
  }
}
```

**Step 4: Run test to verify it passes**

**Step 5: Commit**

```bash
git add packages/vcs/src/rate-limiter.ts packages/vcs/src/__tests__/rate-limiter.test.ts
git commit -m "feat(vcs): add provider-aware rate limiter with per-provider limits"
```

---

### Task 12: Integration Tests

**Files:**
- Create: `apps/api/src/__tests__/vcs-integration.test.ts`

**Context:** End-to-end test verifying the full webhook-to-results flow works for each provider. Uses mocked provider instances but exercises the real registry, webhook routes, trigger consumer, and results consumer. Verifies that a webhook from each provider type flows through the pipeline correctly.

**Step 1: Write the integration test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { VcsProviderRegistry } from "@sentinel/vcs";
import { registerVcsWebhookRoutes } from "../routes/vcs-webhooks.js";
import type { VcsProvider, VcsProviderType } from "@sentinel/vcs";

function createMockProvider(type: VcsProviderType): VcsProvider {
  return {
    name: type,
    type,
    capabilities: {
      checkRuns: type === "github",
      commitStatus: true,
      prComments: true,
      prAnnotations: type === "github",
      webhookSignatureVerification: true,
      appInstallations: type === "github",
    },
    verifyWebhook: vi.fn().mockResolvedValue(true),
    parseWebhook: vi.fn().mockResolvedValue({
      provider: type,
      type: "push",
      installationId: `inst-${type}`,
      repo: `owner/repo-${type}`,
      owner: "owner",
      commitHash: "abc123",
      branch: "main",
      author: "dev@example.com",
    }),
    fetchDiff: vi.fn().mockResolvedValue({ rawDiff: "diff", files: [] }),
    reportStatus: vi.fn().mockResolvedValue(undefined),
    getInstallationToken: vi.fn().mockResolvedValue("token"),
  };
}

describe("Multi-VCS integration", () => {
  const providers: VcsProviderType[] = ["github", "gitlab", "bitbucket", "azure_devops"];
  const slugMap: Record<VcsProviderType, string> = {
    github: "github",
    gitlab: "gitlab",
    bitbucket: "bitbucket",
    azure_devops: "azure-devops",
  };

  for (const providerType of providers) {
    it(`accepts webhooks from ${providerType}`, async () => {
      const registry = new VcsProviderRegistry();
      const mockProvider = createMockProvider(providerType);
      registry.register(mockProvider);

      const mockEventBus = { publish: vi.fn().mockResolvedValue(undefined) };
      const mockDb = {
        vcsInstallation: {
          findFirst: vi.fn().mockResolvedValue({
            id: "inst-1",
            orgId: "org-1",
            provider: providerType,
            webhookSecret: "secret",
          }),
        },
      };

      const app = Fastify();
      registerVcsWebhookRoutes(app, {
        registry,
        eventBus: mockEventBus as any,
        db: mockDb,
      });
      await app.ready();

      const slug = slugMap[providerType];
      const res = await app.inject({
        method: "POST",
        url: `/webhooks/${slug}`,
        payload: { test: true },
      });

      expect(res.statusCode).toBe(202);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        "sentinel.scan-triggers",
        expect.objectContaining({
          provider: providerType,
          orgId: "org-1",
        }),
      );
    });
  }

  it("all 4 providers can be registered simultaneously", () => {
    const registry = new VcsProviderRegistry();
    for (const type of providers) {
      registry.register(createMockProvider(type));
    }
    expect(registry.list().sort()).toEqual([...providers].sort());
  });

  it("scan trigger event preserves provider field through pipeline", async () => {
    const registry = new VcsProviderRegistry();
    registry.register(createMockProvider("gitlab"));

    const mockEventBus = { publish: vi.fn().mockResolvedValue(undefined) };
    const mockDb = {
      vcsInstallation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "inst-1",
          orgId: "org-1",
          provider: "gitlab",
          webhookSecret: "secret",
        }),
      },
    };

    const app = Fastify();
    registerVcsWebhookRoutes(app, { registry, eventBus: mockEventBus as any, db: mockDb });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/webhooks/gitlab",
      payload: {},
    });

    const publishCall = mockEventBus.publish.mock.calls[0];
    expect(publishCall[0]).toBe("sentinel.scan-triggers");
    expect(publishCall[1].provider).toBe("gitlab");
  });
});
```

**Step 2: Run test to verify it passes**

Run: `npx vitest run apps/api/src/__tests__/vcs-integration.test.ts`
Expected: PASS (all providers accepted, registry works, provider field preserved)

**Step 3: Run full test suite**

Run: `npx turbo test`
Expected: All existing tests still pass + new VCS tests pass

**Step 4: Commit**

```bash
git add apps/api/src/__tests__/vcs-integration.test.ts
git commit -m "test(vcs): add multi-provider integration tests for full webhook-to-results flow"
```

---

## Summary

| Task | Component | Tests | Provider |
|------|-----------|-------|----------|
| 1 | VcsProvider types + package | 5 | All |
| 2 | VcsProviderBase abstract class | 5 | All |
| 3 | Database migration | — | All |
| 4 | GitLab provider | ~12 | GitLab |
| 5 | Bitbucket provider | ~10 | Bitbucket |
| 6 | Azure DevOps provider | ~10 | Azure DevOps |
| 7 | GitHub adapter | ~5 | GitHub |
| 8 | Provider registry + VCS bridge | ~5 | All |
| 9 | Multi-provider webhook routes | ~4 | All |
| 10 | Generalized results consumer | ~5 | All |
| 11 | Provider-aware rate limiter | ~5 | All |
| 12 | Integration tests | ~6 | All |

**Total estimated tests: ~72 new tests**

**Key invariants:**
- Existing GitHub integration continues to work unchanged (adapter pattern)
- Core scan pipeline (Redis Streams, agents, assessor) untouched
- Each provider can be enabled/disabled independently via environment variables
- Provider capabilities drive feature availability (no check runs for GitLab = use commit status + MR notes)
