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
        create: vi.fn().mockImplementation(async (args: any) => {
          checkRunsCreated.push(args);
          return { data: { id: 7777 } };
        }),
        update: vi.fn().mockImplementation(async (args: any) => {
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

  // In-memory Redis mock that supports hash operations
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
          createdAt: new Date(),
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
    octokit, redis, db, publishBus, getOctokit,
    checkRunsCreated, checkRunsUpdated, scansCreated, eventsPublished, redisStore,
  };
}

describe("GitHub Bridge Integration", () => {
  let mocks: ReturnType<typeof createFullMocks>;

  beforeEach(() => {
    mocks = createFullMocks();
  });

  it("full pipeline: trigger -> check run -> diff -> scan -> result -> check run completed", async () => {
    // Phase 1: Webhook trigger arrives
    await handleScanTrigger(
      {
        type: "pull_request",
        installationId: 123,
        repo: "acme/app",
        owner: "acme",
        commitHash: "abc123",
        branch: "feature/auth",
        author: "dev@acme.com",
        prNumber: 42,
        orgId: "org-1",
      },
      {
        redis: mocks.redis as any,
        db: mocks.db as any,
        publishBus: mocks.publishBus as any,
        getOctokit: mocks.getOctokit,
      },
    );

    // Verify: Check Run created as "in_progress"
    expect(mocks.checkRunsCreated).toHaveLength(1);
    expect(mocks.checkRunsCreated[0].status).toBe("in_progress");

    // Verify: Diff fetched via PR endpoint
    expect(mocks.octokit.rest.pulls.get).toHaveBeenCalledWith(
      expect.objectContaining({ pull_number: 42 }),
    );

    // Verify: Scan created in DB with trigger metadata
    expect(mocks.scansCreated).toHaveLength(1);
    expect(mocks.scansCreated[0].triggerType).toBe("webhook");

    // Verify: Published to sentinel.diffs
    expect(mocks.eventsPublished).toHaveLength(1);
    expect(mocks.eventsPublished[0].stream).toBe("sentinel.diffs");
    expect(mocks.eventsPublished[0].data.scanId).toBe("scan-e2e");

    // Verify: Redis correlation stored
    const corrData = await mocks.redis.hgetall("scan:github:scan-e2e");
    expect(corrData.checkRunId).toBe("7777");
    expect(corrData.installationId).toBe("123");
    expect(corrData.owner).toBe("acme");
    expect(corrData.repo).toBe("app");

    // Phase 2: Assessment completes, result arrives
    await handleScanResult(
      { scanId: "scan-e2e", status: "fail", riskScore: 72 },
      {
        redis: mocks.redis as any,
        db: mocks.db as any,
        getOctokit: mocks.getOctokit,
      },
    );

    // Verify: Check Run updated to completed with failure
    expect(mocks.checkRunsUpdated).toHaveLength(1);
    expect(mocks.checkRunsUpdated[0].status).toBe("completed");
    expect(mocks.checkRunsUpdated[0].conclusion).toBe("failure");
    expect(mocks.checkRunsUpdated[0].output.annotations).toBeDefined();
    expect(mocks.checkRunsUpdated[0].output.annotations.length).toBeGreaterThan(0);

    // Verify: Redis correlation cleaned up
    const afterCorr = await mocks.redis.hgetall("scan:github:scan-e2e");
    expect(Object.keys(afterCorr)).toHaveLength(0);
  });

  it("CLI scan (no GitHub context) gracefully skips Check Run", async () => {
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

    expect(mocks.getOctokit).not.toHaveBeenCalled();
    expect(mocks.checkRunsUpdated).toHaveLength(0);
  });

  it("duplicate trigger is idempotent -- only one Check Run created", async () => {
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

    // Use push trigger with compareCommitsWithBasehead returning a diff
    mocks.octokit.rest.repos.compareCommitsWithBasehead.mockResolvedValue({
      data: {
        files: [
          { filename: "src/app.ts", patch: "@@ -1,1 +1,2 @@\n line\n+new" },
        ],
      },
    });

    const deps = {
      redis: mocks.redis as any,
      db: mocks.db as any,
      publishBus: mocks.publishBus as any,
      getOctokit: mocks.getOctokit,
    };

    await handleScanTrigger(trigger, deps);
    await handleScanTrigger(trigger, deps);

    // Only one Check Run created (idempotent via hsetnx)
    expect(mocks.checkRunsCreated).toHaveLength(1);
  });

  it("maps all assessment statuses to correct Check Run conclusions", async () => {
    const cases = [
      { status: "full_pass", expectedConclusion: "success" },
      { status: "provisional_pass", expectedConclusion: "neutral" },
      { status: "fail", expectedConclusion: "failure" },
      { status: "partial", expectedConclusion: "action_required" },
    ];

    for (const { status, expectedConclusion } of cases) {
      const freshMocks = createFullMocks();
      await handleScanResult(
        { scanId: "scan-1", status, riskScore: 50 },
        {
          redis: freshMocks.redis as any,
          db: freshMocks.db as any,
          getOctokit: freshMocks.getOctokit,
        },
      );
      expect(freshMocks.checkRunsUpdated[0]?.conclusion).toBe(expectedConclusion);
    }
  });
});
