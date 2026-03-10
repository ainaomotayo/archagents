# P2: GitHub Check Run Loop — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the `github-bridge` service that closes the Check Run feedback loop: webhook triggers create in-progress Check Runs and fetch diffs, scan results update Check Runs with finding annotations.

**Architecture:** New `github-bridge` process with two Redis Stream consumers (`sentinel.scan-triggers` and `sentinel.results`). Uses two `EventBus` instances (one per subscription). All GitHub API calls centralized in this single service. Existing `assessor-worker` unchanged.

**Tech Stack:** Node.js, `@octokit/rest`, `@sentinel/events` (EventBus + withRetry), `@sentinel/github` (check-runs, annotations, client), `@sentinel/db` (Prisma), Redis hashes for scan→checkRun correlation, `vitest` for tests.

**Important context:**
- `EventBus` supports one subscription per instance → need two instances for two consumers
- `EventBus.subscribe()` is a blocking loop — each consumer runs on its own EventBus
- `@sentinel/github` already exports `buildCheckRunCreate`, `buildCheckRunComplete`, `findingsToAnnotations`, `getInstallationOctokit`
- `withRetry` provides 3-retry exponential backoff with DLQ
- The worker already publishes `{ scanId, status, riskScore, certificateId }` to `sentinel.results`
- The webhook handler already publishes `{ type, installationId, repo, owner, commitHash, branch, author, prNumber?, orgId }` to `sentinel.scan-triggers`

---

### Task 1: Extract parseDiff to @sentinel/shared

**Files:**
- Create: `packages/shared/src/diff-parser.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/cli/src/git/diff.ts` (re-export from shared)
- Create: `packages/shared/src/__tests__/diff-parser.test.ts`

**Step 1: Write the test**

```typescript
// packages/shared/src/__tests__/diff-parser.test.ts
import { describe, it, expect } from "vitest";
import { parseDiff } from "../diff-parser.js";

describe("parseDiff", () => {
  it("returns empty array for empty input", () => {
    expect(parseDiff("")).toEqual([]);
    expect(parseDiff("  \n  ")).toEqual([]);
  });

  it("parses a single-file diff", () => {
    const raw = [
      "diff --git a/src/main.ts b/src/main.ts",
      "index abc1234..def5678 100644",
      "--- a/src/main.ts",
      "+++ b/src/main.ts",
      "@@ -1,3 +1,4 @@",
      " import { foo } from './foo';",
      "+import { bar } from './bar';",
      " ",
      " console.log(foo);",
    ].join("\n");

    const files = parseDiff(raw);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/main.ts");
    expect(files[0].hunks).toHaveLength(1);
    expect(files[0].hunks[0].newStart).toBe(1);
    expect(files[0].hunks[0].newCount).toBe(4);
  });

  it("parses multi-file diff", () => {
    const raw = [
      "diff --git a/a.ts b/a.ts",
      "@@ -1,1 +1,2 @@",
      " line1",
      "+line2",
      "diff --git a/b.ts b/b.ts",
      "@@ -0,0 +1,3 @@",
      "+new file line1",
      "+new file line2",
      "+new file line3",
    ].join("\n");

    const files = parseDiff(raw);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe("a.ts");
    expect(files[1].path).toBe("b.ts");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared && npx vitest run src/__tests__/diff-parser.test.ts`
Expected: FAIL — cannot find module `../diff-parser.js`

**Step 3: Create diff-parser.ts**

```typescript
// packages/shared/src/diff-parser.ts
import type { DiffHunk } from "./types.js";

export interface DiffFile {
  path: string;
  hunks: DiffHunk[];
}

export function parseDiff(raw: string): DiffFile[] {
  if (!raw.trim()) return [];

  const files: DiffFile[] = [];
  const fileSections = raw.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const pathMatch = section.match(/^a\/(.+?) b\/(.+)/m);
    if (!pathMatch) continue;

    const path = pathMatch[2];
    const hunks: DiffHunk[] = [];
    const hunkRegex = /@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/g;

    let match;
    while ((match = hunkRegex.exec(section)) !== null) {
      const oldStart = parseInt(match[1], 10);
      const oldCount = parseInt(match[2] || "1", 10);
      const newStart = parseInt(match[3], 10);
      const newCount = parseInt(match[4] || "1", 10);

      const startIdx = match.index + match[0].length;
      const nextHunk = section.indexOf("\n@@", startIdx);
      const content = section.slice(
        startIdx,
        nextHunk === -1 ? undefined : nextHunk,
      );

      hunks.push({ oldStart, oldCount, newStart, newCount, content });
    }

    files.push({ path, hunks });
  }

  return files;
}
```

**Step 4: Export from shared index**

Add to `packages/shared/src/index.ts`:
```typescript
export { parseDiff, type DiffFile } from "./diff-parser.js";
```

**Step 5: Run test to verify it passes**

Run: `cd packages/shared && npx vitest run src/__tests__/diff-parser.test.ts`
Expected: 3 tests PASS

**Step 6: Update CLI to re-export from shared**

Replace `apps/cli/src/git/diff.ts` contents:
```typescript
// Re-export from shared package (canonical location)
export { parseDiff, type DiffFile } from "@sentinel/shared";
```

**Step 7: Verify CLI still builds**

Run: `npx turbo build --filter=@sentinel/cli`
Expected: Build succeeds

**Step 8: Commit**

```bash
git add packages/shared/src/diff-parser.ts packages/shared/src/__tests__/diff-parser.test.ts packages/shared/src/index.ts apps/cli/src/git/diff.ts
git commit -m "refactor: extract parseDiff to @sentinel/shared"
```

---

### Task 2: Prisma schema migration — triggerType + triggerMeta

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (lines 45-67, Scan model)

**Step 1: Add fields to Scan model**

In `packages/db/prisma/schema.prisma`, add two fields to the Scan model after `metadata`:

```prisma
model Scan {
  id          String    @id @default(uuid()) @db.Uuid
  projectId   String    @map("project_id") @db.Uuid
  orgId       String    @map("org_id") @db.Uuid
  commitHash  String    @map("commit_hash")
  branch      String
  author      String
  status      String    @default("pending")
  riskScore   Int?      @map("risk_score")
  scanLevel   String    @default("standard") @map("scan_level")
  metadata    Json      @default("{}")
  triggerType String?   @map("trigger_type")
  triggerMeta Json      @default("{}") @map("trigger_meta")
  startedAt   DateTime  @default(now()) @map("started_at")
  completedAt DateTime? @map("completed_at")

  project      Project       @relation(fields: [projectId], references: [id])
  findings     Finding[]
  agentResults AgentResult[]
  certificate  Certificate?

  @@index([projectId, startedAt(sort: Desc)])
  @@index([commitHash])
  @@index([orgId])
  @@map("scans")
}
```

**Step 2: Generate migration**

Run: `cd packages/db && npx prisma migrate dev --name add_scan_trigger_fields`
Expected: Migration created and applied

**Step 3: Regenerate Prisma client**

Run: `cd packages/db && npx prisma generate`
Expected: Prisma client regenerated

**Step 4: Build to verify**

Run: `npx turbo build --filter=@sentinel/db`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat: add triggerType and triggerMeta to Scan model"
```

---

### Task 3: Rate limiter utility

**Files:**
- Create: `apps/api/src/github/rate-limiter.ts`
- Create: `apps/api/src/github/__tests__/rate-limiter.test.ts`

**Step 1: Write the test**

```typescript
// apps/api/src/github/__tests__/rate-limiter.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, RATE_LIMIT_MAX } from "../rate-limiter.js";

// Minimal Redis mock
function createRedisMock() {
  const store = new Map<string, number>();
  return {
    incr: async (key: string) => {
      const val = (store.get(key) ?? 0) + 1;
      store.set(key, val);
      return val;
    },
    expire: async (_key: string, _ttl: number) => {},
    _store: store,
  };
}

describe("checkRateLimit", () => {
  let redis: ReturnType<typeof createRedisMock>;

  beforeEach(() => {
    redis = createRedisMock();
  });

  it("allows requests under limit", async () => {
    const ok = await checkRateLimit(redis as any, 12345);
    expect(ok).toBe(true);
  });

  it("rejects requests at limit", async () => {
    redis._store.set("github:ratelimit:12345", RATE_LIMIT_MAX);
    const ok = await checkRateLimit(redis as any, 12345);
    expect(ok).toBe(false);
  });

  it("tracks per-installation", async () => {
    redis._store.set("github:ratelimit:111", RATE_LIMIT_MAX);
    const blocked = await checkRateLimit(redis as any, 111);
    const allowed = await checkRateLimit(redis as any, 222);
    expect(blocked).toBe(false);
    expect(allowed).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/github/__tests__/rate-limiter.test.ts`
Expected: FAIL — cannot resolve `../rate-limiter.js`

**Step 3: Implement rate limiter**

```typescript
// apps/api/src/github/rate-limiter.ts
import type { Redis } from "ioredis";

export const RATE_LIMIT_MAX = 4500; // Leave 500 buffer from GitHub's 5000/hr
const WINDOW_SECONDS = 3600;

function rateLimitKey(installationId: number): string {
  return `github:ratelimit:${installationId}`;
}

export async function checkRateLimit(
  redis: Redis,
  installationId: number,
): Promise<boolean> {
  const key = rateLimitKey(installationId);
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }
  return current <= RATE_LIMIT_MAX;
}
```

**Step 4: Run test**

Run: `cd apps/api && npx vitest run src/github/__tests__/rate-limiter.test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add apps/api/src/github/rate-limiter.ts apps/api/src/github/__tests__/rate-limiter.test.ts
git commit -m "feat: add GitHub API rate limiter (token bucket)"
```

---

### Task 4: Diff fetcher (GitHub API)

**Files:**
- Create: `apps/api/src/github/diff-fetcher.ts`
- Create: `apps/api/src/github/__tests__/diff-fetcher.test.ts`

**Step 1: Write the test**

```typescript
// apps/api/src/github/__tests__/diff-fetcher.test.ts
import { describe, it, expect, vi } from "vitest";
import { fetchDiff } from "../diff-fetcher.js";

function mockOctokit(diffText: string) {
  return {
    rest: {
      pulls: {
        get: vi.fn().mockResolvedValue({ data: diffText }),
      },
      repos: {
        compareCommitsWithBasehead: vi.fn().mockResolvedValue({
          data: { files: [{ filename: "a.ts", patch: "@@ -1,1 +1,2 @@\n line\n+new" }] },
        }),
      },
    },
  };
}

describe("fetchDiff", () => {
  it("fetches PR diff for pull_request trigger", async () => {
    const diffText = "diff --git a/f.ts b/f.ts\n@@ -1,1 +1,2 @@\n line\n+new";
    const octokit = mockOctokit(diffText);
    const result = await fetchDiff(octokit as any, {
      type: "pull_request",
      owner: "acme",
      repo: "acme/app",
      commitHash: "abc123",
      branch: "feature",
      prNumber: 42,
    });
    expect(result).toContain("diff --git");
    expect(octokit.rest.pulls.get).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      pull_number: 42,
      mediaType: { format: "diff" },
    });
  });

  it("fetches compare diff for push trigger", async () => {
    const octokit = mockOctokit("");
    const result = await fetchDiff(octokit as any, {
      type: "push",
      owner: "acme",
      repo: "acme/app",
      commitHash: "abc123",
      branch: "main",
    });
    expect(result).toContain("@@");
    expect(octokit.rest.repos.compareCommitsWithBasehead).toHaveBeenCalled();
  });

  it("throws on missing prNumber for pull_request type", async () => {
    const octokit = mockOctokit("");
    await expect(
      fetchDiff(octokit as any, {
        type: "pull_request",
        owner: "acme",
        repo: "acme/app",
        commitHash: "abc123",
        branch: "feature",
      }),
    ).rejects.toThrow("prNumber");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/github/__tests__/diff-fetcher.test.ts`
Expected: FAIL — cannot resolve `../diff-fetcher.js`

**Step 3: Implement diff fetcher**

```typescript
// apps/api/src/github/diff-fetcher.ts
import type { Octokit } from "@octokit/rest";

export interface TriggerContext {
  type: "push" | "pull_request";
  owner: string;
  repo: string; // "owner/repo" format
  commitHash: string;
  branch: string;
  prNumber?: number;
}

/**
 * Fetch a raw unified diff from GitHub.
 *
 * - PR triggers use the pulls.get endpoint with diff media type.
 * - Push triggers use compareCommitsWithBasehead and reconstruct a diff from patches.
 */
export async function fetchDiff(
  octokit: Octokit,
  ctx: TriggerContext,
): Promise<string> {
  const repoName = ctx.repo.includes("/") ? ctx.repo.split("/")[1] : ctx.repo;

  if (ctx.type === "pull_request") {
    if (!ctx.prNumber) {
      throw new Error("prNumber required for pull_request trigger");
    }
    const res = await octokit.rest.pulls.get({
      owner: ctx.owner,
      repo: repoName,
      pull_number: ctx.prNumber,
      mediaType: { format: "diff" },
    });
    // When using diff media type, data is the raw diff string
    return res.data as unknown as string;
  }

  // Push — compare parent commit to HEAD
  const res = await octokit.rest.repos.compareCommitsWithBasehead({
    owner: ctx.owner,
    repo: repoName,
    basehead: `${ctx.commitHash}~1...${ctx.commitHash}`,
  });

  // Reconstruct unified diff from file patches
  const files = (res.data as any).files ?? [];
  const parts: string[] = [];
  for (const file of files) {
    if (file.patch) {
      parts.push(
        `diff --git a/${file.filename} b/${file.filename}\n${file.patch}`,
      );
    }
  }
  return parts.join("\n");
}
```

**Step 4: Run test**

Run: `cd apps/api && npx vitest run src/github/__tests__/diff-fetcher.test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add apps/api/src/github/diff-fetcher.ts apps/api/src/github/__tests__/diff-fetcher.test.ts
git commit -m "feat: add GitHub diff fetcher (PR + push)"
```

---

### Task 5: Trigger consumer (sentinel.scan-triggers)

**Files:**
- Create: `apps/api/src/github/trigger-consumer.ts`
- Create: `apps/api/src/github/__tests__/trigger-consumer.test.ts`

**Step 1: Write the test**

```typescript
// apps/api/src/github/__tests__/trigger-consumer.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleScanTrigger } from "../trigger-consumer.js";

const DIFF_TEXT = "diff --git a/f.ts b/f.ts\n@@ -1,1 +1,2 @@\n line\n+new";

function createMocks() {
  const octokit = {
    rest: {
      checks: {
        create: vi.fn().mockResolvedValue({ data: { id: 9999 } }),
      },
      pulls: {
        get: vi.fn().mockResolvedValue({ data: DIFF_TEXT }),
      },
      repos: {
        compareCommitsWithBasehead: vi.fn().mockResolvedValue({
          data: { files: [] },
        }),
      },
    },
  };

  const redis = {
    hsetnx: vi.fn().mockResolvedValue(1), // 1 = key was set (new)
    hset: vi.fn().mockResolvedValue("OK"),
    expire: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
  };

  const db = {
    project: {
      findFirst: vi.fn().mockResolvedValue({ id: "proj-1", orgId: "org-1" }),
      create: vi.fn().mockResolvedValue({ id: "proj-new", orgId: "org-1" }),
    },
    scan: {
      create: vi.fn().mockResolvedValue({ id: "scan-1", status: "pending" }),
    },
  };

  const eventBus = {
    publish: vi.fn().mockResolvedValue("stream-id"),
  };

  const getOctokit = vi.fn().mockReturnValue(octokit);

  return { octokit, redis, db, eventBus, getOctokit };
}

describe("handleScanTrigger", () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
  });

  it("creates check run, fetches diff, creates scan, publishes to sentinel.diffs", async () => {
    const trigger = {
      type: "pull_request",
      installationId: 123,
      repo: "acme/app",
      owner: "acme",
      commitHash: "abc123",
      branch: "feature/foo",
      author: "dev@acme.com",
      prNumber: 42,
      orgId: "org-1",
    };

    await handleScanTrigger(trigger as any, {
      redis: mocks.redis as any,
      db: mocks.db as any,
      publishBus: mocks.eventBus as any,
      getOctokit: mocks.getOctokit,
    });

    // Check run created
    expect(mocks.octokit.rest.checks.create).toHaveBeenCalledTimes(1);
    // Diff fetched via PR endpoint
    expect(mocks.octokit.rest.pulls.get).toHaveBeenCalledTimes(1);
    // Scan created in DB
    expect(mocks.db.scan.create).toHaveBeenCalledTimes(1);
    // Published to sentinel.diffs
    expect(mocks.eventBus.publish).toHaveBeenCalledWith(
      "sentinel.diffs",
      expect.objectContaining({ scanId: "scan-1" }),
    );
    // Correlation stored in Redis
    expect(mocks.redis.hset).toHaveBeenCalled();
  });

  it("auto-creates project if none found for repo", async () => {
    mocks.db.project.findFirst.mockResolvedValue(null);

    const trigger = {
      type: "push",
      installationId: 123,
      repo: "acme/app",
      owner: "acme",
      commitHash: "abc123",
      branch: "main",
      author: "dev@acme.com",
      orgId: "org-1",
    };

    await handleScanTrigger(trigger as any, {
      redis: mocks.redis as any,
      db: mocks.db as any,
      publishBus: mocks.eventBus as any,
      getOctokit: mocks.getOctokit,
    });

    expect(mocks.db.project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "acme/app",
        repoUrl: "https://github.com/acme/app",
        orgId: "org-1",
      }),
    });
  });

  it("skips check run creation if idempotency key exists", async () => {
    mocks.redis.hsetnx.mockResolvedValue(0); // 0 = key already exists

    const trigger = {
      type: "push",
      installationId: 123,
      repo: "acme/app",
      owner: "acme",
      commitHash: "abc123",
      branch: "main",
      author: "dev",
      orgId: "org-1",
    };

    await handleScanTrigger(trigger as any, {
      redis: mocks.redis as any,
      db: mocks.db as any,
      publishBus: mocks.eventBus as any,
      getOctokit: mocks.getOctokit,
    });

    // Check run NOT created (idempotent)
    expect(mocks.octokit.rest.checks.create).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/github/__tests__/trigger-consumer.test.ts`
Expected: FAIL — cannot resolve `../trigger-consumer.js`

**Step 3: Implement trigger consumer**

```typescript
// apps/api/src/github/trigger-consumer.ts
import type { Redis } from "ioredis";
import type { Octokit } from "@octokit/rest";
import type { EventBus } from "@sentinel/events";
import type { PrismaClient } from "@sentinel/db";
import { buildCheckRunCreate } from "@sentinel/github";
import { parseDiff } from "@sentinel/shared";
import { createLogger } from "@sentinel/telemetry";
import { fetchDiff } from "./diff-fetcher.js";
import { checkRateLimit } from "./rate-limiter.js";

const logger = createLogger({ name: "github-bridge:triggers" });

const CORRELATION_TTL = 86400; // 24 hours

export interface ScanTriggerEvent {
  type: "push" | "pull_request";
  installationId: number;
  repo: string;
  owner: string;
  commitHash: string;
  branch: string;
  author: string;
  prNumber?: number;
  orgId: string;
}

export interface TriggerDeps {
  redis: Redis;
  db: PrismaClient;
  publishBus: EventBus;
  getOctokit: (installationId: number) => Octokit;
}

function correlationKey(scanId: string): string {
  return `scan:github:${scanId}`;
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const langMap: Record<string, string> = {
    py: "python", js: "javascript", ts: "typescript", tsx: "typescript",
    jsx: "javascript", go: "go", rs: "rust", java: "java", rb: "ruby",
    cs: "csharp", cpp: "cpp", c: "c", swift: "swift", kt: "kotlin",
  };
  return langMap[ext] ?? "unknown";
}

export async function handleScanTrigger(
  trigger: ScanTriggerEvent,
  deps: TriggerDeps,
): Promise<void> {
  const { redis, db, publishBus, getOctokit } = deps;
  const octokit = getOctokit(trigger.installationId);
  const repoName = trigger.repo.includes("/")
    ? trigger.repo.split("/")[1]
    : trigger.repo;

  // Rate limit check
  const allowed = await checkRateLimit(redis, trigger.installationId);
  if (!allowed) {
    throw new Error(`Rate limited for installation ${trigger.installationId}`);
  }

  // Resolve or auto-create project
  let project = await db.project.findFirst({
    where: { repoUrl: `https://github.com/${trigger.repo}`, orgId: trigger.orgId },
  });
  if (!project) {
    project = await db.project.create({
      data: {
        name: trigger.repo,
        repoUrl: `https://github.com/${trigger.repo}`,
        orgId: trigger.orgId,
      },
    });
    logger.info({ repo: trigger.repo, projectId: project.id }, "Auto-created project");
  }

  // Idempotency: check if this trigger was already processed
  // Use a temporary key to claim this trigger
  const idempotencyKey = `scan:trigger:${trigger.commitHash}:${trigger.prNumber ?? "push"}`;
  const isNew = await redis.hsetnx(idempotencyKey, "status", "processing");

  let checkRunId: number | undefined;

  if (isNew) {
    // Create "in_progress" Check Run
    const checkRunPayload = buildCheckRunCreate("pending", trigger.commitHash);
    const checkRes = await octokit.rest.checks.create({
      owner: trigger.owner,
      repo: repoName,
      ...checkRunPayload,
    });
    checkRunId = checkRes.data.id;
    await redis.expire(idempotencyKey, CORRELATION_TTL);
  }

  // Fetch diff from GitHub
  const rawDiff = await fetchDiff(octokit, {
    type: trigger.type,
    owner: trigger.owner,
    repo: trigger.repo,
    commitHash: trigger.commitHash,
    branch: trigger.branch,
    prNumber: trigger.prNumber,
  });

  if (!rawDiff.trim()) {
    logger.warn({ repo: trigger.repo, commit: trigger.commitHash }, "Empty diff, skipping");
    return;
  }

  // Parse diff into structured payload
  const diffFiles = parseDiff(rawDiff);

  // Create Scan in DB
  const scan = await db.scan.create({
    data: {
      projectId: project.id,
      orgId: trigger.orgId,
      commitHash: trigger.commitHash,
      branch: trigger.branch,
      author: trigger.author,
      status: "pending",
      triggerType: "webhook",
      triggerMeta: {
        installationId: trigger.installationId,
        owner: trigger.owner,
        repo: trigger.repo,
        prNumber: trigger.prNumber ?? null,
        checkRunId: checkRunId ?? null,
      },
    },
  });

  // Store correlation for results consumer
  if (checkRunId) {
    const key = correlationKey(scan.id);
    await redis.hset(key, {
      checkRunId: String(checkRunId),
      installationId: String(trigger.installationId),
      owner: trigger.owner,
      repo: repoName,
      commitHash: trigger.commitHash,
    });
    await redis.expire(key, CORRELATION_TTL);
  }

  // Publish to sentinel.diffs — agents pick this up
  await publishBus.publish("sentinel.diffs", {
    scanId: scan.id,
    payload: {
      projectId: project.id,
      commitHash: trigger.commitHash,
      branch: trigger.branch,
      author: trigger.author,
      timestamp: new Date().toISOString(),
      files: diffFiles.map((f) => ({
        path: f.path,
        language: detectLanguage(f.path),
        hunks: f.hunks,
        aiScore: 0,
      })),
      scanConfig: {
        securityLevel: "standard" as const,
        licensePolicy: "",
        qualityThreshold: 0.7,
      },
    },
    submittedAt: new Date().toISOString(),
  });

  logger.info({
    scanId: scan.id,
    repo: trigger.repo,
    commit: trigger.commitHash,
    checkRunId,
    files: diffFiles.length,
  }, "Scan triggered from webhook");
}
```

**Step 4: Run test**

Run: `cd apps/api && npx vitest run src/github/__tests__/trigger-consumer.test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add apps/api/src/github/trigger-consumer.ts apps/api/src/github/__tests__/trigger-consumer.test.ts
git commit -m "feat: add scan-triggers consumer for GitHub webhooks"
```

---

### Task 6: Results consumer (sentinel.results → Check Run)

**Files:**
- Create: `apps/api/src/github/results-consumer.ts`
- Create: `apps/api/src/github/__tests__/results-consumer.test.ts`

**Step 1: Write the test**

```typescript
// apps/api/src/github/__tests__/results-consumer.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleScanResult } from "../results-consumer.js";

function createMocks() {
  const octokit = {
    rest: {
      checks: {
        update: vi.fn().mockResolvedValue({ data: { id: 9999 } }),
      },
    },
  };

  const redis = {
    hgetall: vi.fn().mockResolvedValue({
      checkRunId: "9999",
      installationId: "123",
      owner: "acme",
      repo: "app",
      commitHash: "abc123",
    }),
    del: vi.fn().mockResolvedValue(1),
  };

  const db = {
    finding: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "f1",
          type: "security",
          severity: "high",
          file: "src/main.ts",
          lineStart: 10,
          lineEnd: 12,
          title: "SQL Injection",
          description: "User input in query",
          remediation: "Use parameterized queries",
          confidence: 0.9,
          rawData: {},
        },
      ]),
    },
    scan: {
      findUnique: vi.fn().mockResolvedValue({
        id: "scan-1",
        triggerMeta: {
          checkRunId: 9999,
          installationId: 123,
          owner: "acme",
          repo: "app",
        },
        commitHash: "abc123",
      }),
    },
  };

  const getOctokit = vi.fn().mockReturnValue(octokit);

  return { octokit, redis, db, getOctokit };
}

describe("handleScanResult", () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
  });

  it("updates check run with findings annotations on completion", async () => {
    await handleScanResult(
      { scanId: "scan-1", status: "fail", riskScore: 72 },
      {
        redis: mocks.redis as any,
        db: mocks.db as any,
        getOctokit: mocks.getOctokit,
      },
    );

    expect(mocks.octokit.rest.checks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "acme",
        repo: "app",
        check_run_id: 9999,
        status: "completed",
        conclusion: "failure",
      }),
    );
  });

  it("skips if no GitHub context (CLI scan)", async () => {
    mocks.redis.hgetall.mockResolvedValue({});
    mocks.db.scan.findUnique.mockResolvedValue({
      id: "scan-1",
      triggerMeta: {},
      commitHash: "abc",
    });

    await handleScanResult(
      { scanId: "scan-1", status: "full_pass", riskScore: 5 },
      {
        redis: mocks.redis as any,
        db: mocks.db as any,
        getOctokit: mocks.getOctokit,
      },
    );

    // No check run update
    expect(mocks.getOctokit).not.toHaveBeenCalled();
  });

  it("cleans up Redis correlation after posting", async () => {
    await handleScanResult(
      { scanId: "scan-1", status: "full_pass", riskScore: 5 },
      {
        redis: mocks.redis as any,
        db: mocks.db as any,
        getOctokit: mocks.getOctokit,
      },
    );

    expect(mocks.redis.del).toHaveBeenCalledWith("scan:github:scan-1");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/github/__tests__/results-consumer.test.ts`
Expected: FAIL — cannot resolve `../results-consumer.js`

**Step 3: Implement results consumer**

```typescript
// apps/api/src/github/results-consumer.ts
import type { Redis } from "ioredis";
import type { Octokit } from "@octokit/rest";
import type { PrismaClient } from "@sentinel/db";
import type { AssessmentStatus, Finding } from "@sentinel/shared";
import { buildCheckRunComplete, findingsToAnnotations } from "@sentinel/github";
import { createLogger } from "@sentinel/telemetry";

const logger = createLogger({ name: "github-bridge:results" });

export interface ScanResultEvent {
  scanId: string;
  status: string;
  riskScore: number;
  certificateId?: string;
}

export interface ResultsDeps {
  redis: Redis;
  db: PrismaClient;
  getOctokit: (installationId: number) => Octokit;
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function correlationKey(scanId: string): string {
  return `scan:github:${scanId}`;
}

export async function handleScanResult(
  event: ScanResultEvent,
  deps: ResultsDeps,
): Promise<void> {
  const { redis, db, getOctokit } = deps;
  const { scanId, status, riskScore } = event;

  // 1. Try Redis for GitHub context (fast path)
  const correlation = await redis.hgetall(correlationKey(scanId));
  let checkRunId: number | undefined;
  let installationId: number | undefined;
  let owner: string | undefined;
  let repo: string | undefined;
  let commitHash: string | undefined;

  if (correlation?.checkRunId) {
    checkRunId = parseInt(correlation.checkRunId, 10);
    installationId = parseInt(correlation.installationId, 10);
    owner = correlation.owner;
    repo = correlation.repo;
    commitHash = correlation.commitHash;
  } else {
    // Fallback: check scan.triggerMeta in DB
    const scan = await db.scan.findUnique({ where: { id: scanId } });
    const meta = (scan?.triggerMeta ?? {}) as Record<string, unknown>;
    if (meta.checkRunId) {
      checkRunId = meta.checkRunId as number;
      installationId = meta.installationId as number;
      owner = meta.owner as string;
      repo = meta.repo as string;
      commitHash = scan!.commitHash;
    }
  }

  // No GitHub context — this was a CLI/API scan, skip
  if (!checkRunId || !installationId || !owner || !repo) {
    logger.debug({ scanId }, "No GitHub context, skipping Check Run update");
    return;
  }

  // 2. Load findings, sorted by severity (critical first)
  const findings = await db.finding.findMany({
    where: { scanId },
    orderBy: { createdAt: "asc" },
  });

  // Sort by severity rank for annotation priority
  findings.sort(
    (a: any, b: any) =>
      (SEVERITY_RANK[a.severity] ?? 5) - (SEVERITY_RANK[b.severity] ?? 5),
  );

  // 3. Build annotations (handles 50-annotation cap)
  // Map DB findings to shared Finding type for the annotation builder
  const sharedFindings: Finding[] = findings.map((f: any) => ({
    ...f.rawData,
    type: f.type,
    file: f.file,
    lineStart: f.lineStart,
    lineEnd: f.lineEnd,
    severity: f.severity,
    confidence: f.confidence,
    title: f.title,
    description: f.description,
    remediation: f.remediation,
  }));

  const annotations = findingsToAnnotations(sharedFindings);

  // 4. Build and post completed Check Run
  const checkRunPayload = buildCheckRunComplete(
    scanId,
    status as AssessmentStatus,
    riskScore,
    annotations,
  );

  const octokit = getOctokit(installationId);
  await octokit.rest.checks.update({
    owner,
    repo,
    check_run_id: checkRunId,
    status: checkRunPayload.status,
    conclusion: checkRunPayload.conclusion,
    output: checkRunPayload.output,
  });

  // 5. Cleanup
  await redis.del(correlationKey(scanId));

  logger.info({
    scanId,
    checkRunId,
    status,
    riskScore,
    annotationCount: annotations.length,
    findingCount: findings.length,
  }, "Check Run updated with scan results");
}
```

**Step 4: Run test**

Run: `cd apps/api && npx vitest run src/github/__tests__/results-consumer.test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add apps/api/src/github/results-consumer.ts apps/api/src/github/__tests__/results-consumer.test.ts
git commit -m "feat: add results consumer — posts Check Runs with annotations"
```

---

### Task 7: github-bridge.ts process entrypoint

**Files:**
- Create: `apps/api/src/github-bridge.ts`

**Step 1: Implement the entrypoint**

```typescript
// apps/api/src/github-bridge.ts
import http from "node:http";
import { Redis } from "ioredis";
import { EventBus, withRetry } from "@sentinel/events";
import { getDb, disconnectDb } from "@sentinel/db";
import { configureGitHubApp, getInstallationOctokit, isGitHubAppConfigured } from "@sentinel/github";
import { createLogger } from "@sentinel/telemetry";
import { handleScanTrigger } from "./github/trigger-consumer.js";
import { handleScanResult } from "./github/results-consumer.js";

const logger = createLogger({ name: "github-bridge" });

// --- Configuration ---

if (process.env.GITHUB_APP_ID && process.env.GITHUB_PRIVATE_KEY) {
  configureGitHubApp({
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_PRIVATE_KEY,
  });
}

if (!isGitHubAppConfigured()) {
  logger.error("GITHUB_APP_ID and GITHUB_PRIVATE_KEY are required for github-bridge");
  process.exit(1);
}

// --- Infrastructure ---

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const redis = new Redis(redisUrl);
const db = getDb();

// Two separate EventBus instances — each subscribe() is a blocking loop
const triggerBus = new EventBus(new Redis(redisUrl));
const resultsBus = new EventBus(new Redis(redisUrl));

// Shared EventBus for publishing (non-blocking)
const publishBus = new EventBus(new Redis(redisUrl));

// --- Health server ---

const healthPort = parseInt(process.env.GITHUB_BRIDGE_PORT ?? "9092", 10);
const healthServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
healthServer.listen(healthPort);
logger.info({ port: healthPort }, "Health server listening");

// --- Consumer 1: scan-triggers ---

const triggerHandler = withRetry(redis, "sentinel.scan-triggers", async (_id, data) => {
  await handleScanTrigger(data as any, {
    redis,
    db,
    publishBus,
    getOctokit: getInstallationOctokit,
  });
}, { maxRetries: 3, baseDelayMs: 2000 });

triggerBus.subscribe(
  "sentinel.scan-triggers",
  "github-bridge",
  `bridge-triggers-${process.pid}`,
  triggerHandler,
);

logger.info("Consuming sentinel.scan-triggers...");

// --- Consumer 2: sentinel.results ---

const resultsHandler = withRetry(redis, "sentinel.results", async (_id, data) => {
  await handleScanResult(data as any, {
    redis,
    db,
    getOctokit: getInstallationOctokit,
  });
}, { maxRetries: 3, baseDelayMs: 2000 });

resultsBus.subscribe(
  "sentinel.results",
  "github-bridge",
  `bridge-results-${process.pid}`,
  resultsHandler,
);

logger.info("Consuming sentinel.results...");

// --- Graceful shutdown ---

const shutdown = async () => {
  logger.info("GitHub bridge shutting down...");
  healthServer.close();
  await triggerBus.disconnect();
  await resultsBus.disconnect();
  await publishBus.disconnect();
  redis.disconnect();
  await disconnectDb();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

logger.info("GitHub bridge started");
```

**Step 2: Verify it builds**

Run: `npx turbo build --filter=@sentinel/api`
Expected: Build succeeds (compiles to `dist/github-bridge.js`)

**Step 3: Commit**

```bash
git add apps/api/src/github-bridge.ts
git commit -m "feat: add github-bridge process entrypoint"
```

---

### Task 8: Docker Compose integration

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Add github-bridge service**

Add after the `scheduler` service in `docker-compose.yml`:

```yaml
  github-bridge:
    build:
      context: .
      dockerfile: docker/api.Dockerfile
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://sentinel:sentinel_dev@postgres:5432/sentinel
      REDIS_URL: redis://redis:6379
      GITHUB_APP_ID: ${GITHUB_APP_ID:-}
      GITHUB_PRIVATE_KEY: ${GITHUB_PRIVATE_KEY:-}
      GITHUB_BRIDGE_PORT: "9092"
    command: ["node", "apps/api/dist/github-bridge.js"]
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:9092/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 3
```

**Step 2: Verify compose config**

Run: `docker compose config --services`
Expected: Lists all services including `github-bridge`

**Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add github-bridge service to docker-compose"
```

---

### Task 9: Integration tests

**Files:**
- Create: `apps/api/src/github/__tests__/github-bridge-integration.test.ts`

**Step 1: Write full pipeline integration tests**

```typescript
// apps/api/src/github/__tests__/github-bridge-integration.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleScanTrigger } from "../trigger-consumer.js";
import { handleScanResult } from "../results-consumer.js";

const SAMPLE_DIFF = [
  "diff --git a/src/app.ts b/src/app.ts",
  "@@ -1,3 +1,5 @@",
  " import express from 'express';",
  "+import { db } from './db';",
  "+const secret = 'hardcoded';",
  " const app = express();",
].join("\n");

function createFullMocks() {
  const checkRunsCreated: any[] = [];
  const checkRunsUpdated: any[] = [];
  const scansCreated: any[] = [];
  const eventsPublished: any[] = [];

  const octokit = {
    rest: {
      checks: {
        create: vi.fn().mockImplementation(async (args) => {
          checkRunsCreated.push(args);
          return { data: { id: 7777 } };
        }),
        update: vi.fn().mockImplementation(async (args) => {
          checkRunsUpdated.push(args);
          return { data: { id: 7777 } };
        }),
      },
      pulls: {
        get: vi.fn().mockResolvedValue({ data: SAMPLE_DIFF }),
      },
      repos: {
        compareCommitsWithBasehead: vi.fn().mockResolvedValue({
          data: { files: [] },
        }),
      },
    },
  };

  const redisStore = new Map<string, Map<string, string>>();
  const redis = {
    hsetnx: vi.fn().mockImplementation(async (key: string, field: string, value: string) => {
      if (!redisStore.has(key)) redisStore.set(key, new Map());
      if (redisStore.get(key)!.has(field)) return 0;
      redisStore.get(key)!.set(field, value);
      return 1;
    }),
    hset: vi.fn().mockImplementation(async (key: string, data: Record<string, string>) => {
      if (!redisStore.has(key)) redisStore.set(key, new Map());
      for (const [k, v] of Object.entries(data)) {
        redisStore.get(key)!.set(k, v);
      }
      return "OK";
    }),
    hgetall: vi.fn().mockImplementation(async (key: string) => {
      const map = redisStore.get(key);
      if (!map || map.size === 0) return {};
      return Object.fromEntries(map);
    }),
    del: vi.fn().mockImplementation(async (key: string) => {
      redisStore.delete(key);
      return 1;
    }),
    expire: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
  };

  const db = {
    project: {
      findFirst: vi.fn().mockResolvedValue({ id: "proj-1", orgId: "org-1" }),
      create: vi.fn().mockResolvedValue({ id: "proj-1", orgId: "org-1" }),
    },
    scan: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const scan = { id: "scan-e2e", status: "pending", ...data };
        scansCreated.push(scan);
        return scan;
      }),
      findUnique: vi.fn().mockImplementation(async () => ({
        id: "scan-e2e",
        commitHash: "abc123",
        triggerMeta: {
          checkRunId: 7777,
          installationId: 123,
          owner: "acme",
          repo: "app",
        },
      })),
    },
    finding: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "f1",
          type: "security",
          severity: "high",
          file: "src/app.ts",
          lineStart: 3,
          lineEnd: 3,
          title: "Hardcoded Secret",
          description: "Secret found in source code",
          remediation: "Use environment variables",
          confidence: 0.9,
          rawData: {
            type: "security",
            file: "src/app.ts",
            lineStart: 3,
            lineEnd: 3,
            severity: "high",
            confidence: "high",
            category: "credentials",
            title: "Hardcoded Secret",
            description: "Secret found in source code",
            remediation: "Use environment variables",
            scanner: "semgrep",
            cweId: "CWE-798",
          },
        },
      ]),
    },
  };

  const publishBus = {
    publish: vi.fn().mockImplementation(async (stream: string, data: any) => {
      eventsPublished.push({ stream, data });
      return "stream-id";
    }),
  };

  const getOctokit = vi.fn().mockReturnValue(octokit);

  return {
    octokit,
    redis,
    db,
    publishBus,
    getOctokit,
    checkRunsCreated,
    checkRunsUpdated,
    scansCreated,
    eventsPublished,
    redisStore,
  };
}

describe("GitHub Bridge Integration", () => {
  let mocks: ReturnType<typeof createFullMocks>;

  beforeEach(() => {
    mocks = createFullMocks();
  });

  it("full pipeline: trigger → check run created → diff fetched → scan published → result → check run completed", async () => {
    // Phase 1: Trigger arrives from webhook
    const trigger = {
      type: "pull_request" as const,
      installationId: 123,
      repo: "acme/app",
      owner: "acme",
      commitHash: "abc123",
      branch: "feature/auth",
      author: "dev@acme.com",
      prNumber: 42,
      orgId: "org-1",
    };

    await handleScanTrigger(trigger, {
      redis: mocks.redis as any,
      db: mocks.db as any,
      publishBus: mocks.publishBus as any,
      getOctokit: mocks.getOctokit,
    });

    // Verify: Check Run created as "in_progress"
    expect(mocks.checkRunsCreated).toHaveLength(1);
    expect(mocks.checkRunsCreated[0].status).toBe("in_progress");

    // Verify: Diff fetched from PR endpoint
    expect(mocks.octokit.rest.pulls.get).toHaveBeenCalledWith(
      expect.objectContaining({ pull_number: 42 }),
    );

    // Verify: Scan created in DB
    expect(mocks.scansCreated).toHaveLength(1);
    expect(mocks.scansCreated[0].triggerType).toBe("webhook");

    // Verify: Published to sentinel.diffs
    expect(mocks.eventsPublished).toHaveLength(1);
    expect(mocks.eventsPublished[0].stream).toBe("sentinel.diffs");
    expect(mocks.eventsPublished[0].data.scanId).toBe("scan-e2e");

    // Verify: Correlation stored in Redis
    const corrKey = "scan:github:scan-e2e";
    const corrData = await mocks.redis.hgetall(corrKey);
    expect(corrData.checkRunId).toBe("7777");

    // Phase 2: Assessment complete, result arrives
    await handleScanResult(
      { scanId: "scan-e2e", status: "fail", riskScore: 72 },
      {
        redis: mocks.redis as any,
        db: mocks.db as any,
        getOctokit: mocks.getOctokit,
      },
    );

    // Verify: Check Run updated to "completed" with failure conclusion
    expect(mocks.checkRunsUpdated).toHaveLength(1);
    expect(mocks.checkRunsUpdated[0].status).toBe("completed");
    expect(mocks.checkRunsUpdated[0].conclusion).toBe("failure");
    expect(mocks.checkRunsUpdated[0].output.annotations).toBeDefined();
    expect(mocks.checkRunsUpdated[0].output.annotations.length).toBeGreaterThan(0);

    // Verify: Redis correlation cleaned up
    const afterCorr = await mocks.redis.hgetall(corrKey);
    expect(Object.keys(afterCorr)).toHaveLength(0);
  });

  it("CLI scan (no GitHub context) gracefully skips Check Run", async () => {
    // Simulate a result for a CLI-initiated scan (no Redis correlation, no triggerMeta)
    mocks.redis.hgetall = vi.fn().mockResolvedValue({});
    mocks.db.scan.findUnique = vi.fn().mockResolvedValue({
      id: "scan-cli",
      commitHash: "def456",
      triggerMeta: {},
    });

    await handleScanResult(
      { scanId: "scan-cli", status: "full_pass", riskScore: 5 },
      {
        redis: mocks.redis as any,
        db: mocks.db as any,
        getOctokit: mocks.getOctokit,
      },
    );

    // No Octokit created, no Check Run posted
    expect(mocks.getOctokit).not.toHaveBeenCalled();
    expect(mocks.checkRunsUpdated).toHaveLength(0);
  });

  it("handles duplicate trigger idempotently", async () => {
    const trigger = {
      type: "push" as const,
      installationId: 123,
      repo: "acme/app",
      owner: "acme",
      commitHash: "abc123",
      branch: "main",
      author: "dev@acme.com",
      orgId: "org-1",
    };

    const deps = {
      redis: mocks.redis as any,
      db: mocks.db as any,
      publishBus: mocks.publishBus as any,
      getOctokit: mocks.getOctokit,
    };

    // First trigger
    await handleScanTrigger(trigger, deps);
    // Second trigger (same commit)
    await handleScanTrigger(trigger, deps);

    // Check Run created only once (idempotent)
    expect(mocks.checkRunsCreated).toHaveLength(1);
    // But scan + diff published both times (agents are idempotent by scanId)
    expect(mocks.eventsPublished).toHaveLength(2);
  });

  it("maps assessment status to correct Check Run conclusion", async () => {
    const statuses = [
      { status: "full_pass", expectedConclusion: "success" },
      { status: "provisional_pass", expectedConclusion: "neutral" },
      { status: "fail", expectedConclusion: "failure" },
      { status: "partial", expectedConclusion: "action_required" },
    ];

    for (const { status, expectedConclusion } of statuses) {
      mocks = createFullMocks();
      await handleScanResult(
        { scanId: "scan-1", status, riskScore: 50 },
        {
          redis: mocks.redis as any,
          db: mocks.db as any,
          getOctokit: mocks.getOctokit,
        },
      );
      expect(mocks.checkRunsUpdated[0].conclusion).toBe(expectedConclusion);
    }
  });
});
```

**Step 2: Run tests**

Run: `cd apps/api && npx vitest run src/github/__tests__/github-bridge-integration.test.ts`
Expected: 4 tests PASS

**Step 3: Run full API test suite to verify no regressions**

Run: `npx turbo test --filter=@sentinel/api`
Expected: All existing tests + new tests PASS (62 + ~13 new = ~75)

**Step 4: Commit**

```bash
git add apps/api/src/github/__tests__/github-bridge-integration.test.ts
git commit -m "test: add github-bridge integration tests"
```

---

### Final verification

Run the full build and test suite:

```bash
npx turbo build
npx turbo test --filter=@sentinel/api
npx turbo test --filter=@sentinel/shared
```

Expected: All builds pass, all tests pass.
