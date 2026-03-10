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
          rawData: {
            type: "security",
            file: "src/main.ts",
            lineStart: 10,
            lineEnd: 12,
            severity: "high",
            confidence: "high",
            category: "injection",
            title: "SQL Injection",
            description: "User input in query",
            remediation: "Use parameterized queries",
            scanner: "semgrep",
            cweId: "CWE-89",
          },
          createdAt: new Date(),
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
    // Should have annotations in the output
    const call = mocks.octokit.rest.checks.update.mock.calls[0][0];
    expect(call.output.annotations).toBeDefined();
    expect(call.output.annotations.length).toBeGreaterThan(0);
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

  it("falls back to DB triggerMeta when Redis empty", async () => {
    mocks.redis.hgetall.mockResolvedValue({});
    // DB has the correlation data
    mocks.db.scan.findUnique.mockResolvedValue({
      id: "scan-1",
      triggerMeta: {
        checkRunId: 8888,
        installationId: 456,
        owner: "corp",
        repo: "service",
      },
      commitHash: "def456",
    });

    await handleScanResult(
      { scanId: "scan-1", status: "full_pass", riskScore: 10 },
      {
        redis: mocks.redis as any,
        db: mocks.db as any,
        getOctokit: mocks.getOctokit,
      },
    );

    expect(mocks.getOctokit).toHaveBeenCalledWith(456);
    expect(mocks.octokit.rest.checks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "corp",
        repo: "service",
        check_run_id: 8888,
      }),
    );
  });
});
