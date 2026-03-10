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
          data: { files: [{ filename: "a.ts", patch: "@@ -1,1 +1,2 @@\n line\n+new" }] },
        }),
      },
    },
  };

  const redis = {
    hsetnx: vi.fn().mockResolvedValue(1),
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
      type: "pull_request" as const,
      installationId: 123,
      repo: "acme/app",
      owner: "acme",
      commitHash: "abc123",
      branch: "feature/foo",
      author: "dev@acme.com",
      prNumber: 42,
      orgId: "org-1",
    };

    await handleScanTrigger(trigger, {
      redis: mocks.redis as any,
      db: mocks.db as any,
      publishBus: mocks.eventBus as any,
      getOctokit: mocks.getOctokit,
    });

    expect(mocks.octokit.rest.checks.create).toHaveBeenCalledTimes(1);
    expect(mocks.octokit.rest.pulls.get).toHaveBeenCalledTimes(1);
    expect(mocks.db.scan.create).toHaveBeenCalledTimes(1);
    expect(mocks.eventBus.publish).toHaveBeenCalledWith(
      "sentinel.diffs",
      expect.objectContaining({ scanId: "scan-1" }),
    );
    expect(mocks.redis.hset).toHaveBeenCalled();
  });

  it("auto-creates project if none found for repo", async () => {
    mocks.db.project.findFirst.mockResolvedValue(null);

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

    await handleScanTrigger(trigger, {
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
    mocks.redis.hsetnx.mockResolvedValue(0);

    const trigger = {
      type: "push" as const,
      installationId: 123,
      repo: "acme/app",
      owner: "acme",
      commitHash: "abc123",
      branch: "main",
      author: "dev",
      orgId: "org-1",
    };

    await handleScanTrigger(trigger, {
      redis: mocks.redis as any,
      db: mocks.db as any,
      publishBus: mocks.eventBus as any,
      getOctokit: mocks.getOctokit,
    });

    expect(mocks.octokit.rest.checks.create).not.toHaveBeenCalled();
  });

  it("skips processing when diff is empty", async () => {
    // Override pulls.get to return empty diff
    mocks.octokit.rest.pulls.get.mockResolvedValue({ data: "   " });

    const trigger = {
      type: "pull_request" as const,
      installationId: 123,
      repo: "acme/app",
      owner: "acme",
      commitHash: "abc123",
      branch: "feature/foo",
      author: "dev",
      prNumber: 42,
      orgId: "org-1",
    };

    await handleScanTrigger(trigger, {
      redis: mocks.redis as any,
      db: mocks.db as any,
      publishBus: mocks.eventBus as any,
      getOctokit: mocks.getOctokit,
    });

    expect(mocks.db.scan.create).not.toHaveBeenCalled();
    expect(mocks.eventBus.publish).not.toHaveBeenCalled();
  });

  it("throws when rate limited", async () => {
    mocks.redis.incr.mockResolvedValue(5000);

    const trigger = {
      type: "push" as const,
      installationId: 123,
      repo: "acme/app",
      owner: "acme",
      commitHash: "abc123",
      branch: "main",
      author: "dev",
      orgId: "org-1",
    };

    await expect(
      handleScanTrigger(trigger, {
        redis: mocks.redis as any,
        db: mocks.db as any,
        publishBus: mocks.eventBus as any,
        getOctokit: mocks.getOctokit,
      }),
    ).rejects.toThrow("Rate limited");
  });
});
