import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleVcsResult } from "../vcs/results-consumer.js";
import type { VcsResultEvent, VcsResultsDeps } from "../vcs/results-consumer.js";

// ---- Mocks ----

function makeMockRedis(correlationData: Record<string, string> | null = null) {
  return {
    hgetall: vi.fn().mockImplementation(async (key: string) => {
      if (correlationData && key.includes("gitlab")) return correlationData;
      return {};
    }),
    del: vi.fn().mockResolvedValue(1),
  };
}

const mockProvider = {
  name: "GitLab",
  type: "gitlab" as const,
  capabilities: {
    checkRuns: false,
    commitStatus: true,
    prComments: true,
    prAnnotations: false,
    webhookSignatureVerification: true,
    appInstallations: true,
  },
  verifyWebhook: vi.fn(),
  parseWebhook: vi.fn(),
  fetchDiff: vi.fn(),
  reportStatus: vi.fn().mockResolvedValue(undefined),
  getInstallationToken: vi.fn(),
  formatAnnotations: vi.fn().mockImplementation((findings: any[]) =>
    findings.map((f: any) => ({
      file: f.file,
      lineStart: f.lineStart,
      lineEnd: f.lineEnd,
      level: f.severity === "critical" || f.severity === "high" ? "failure" : "warning",
      title: f.title,
      message: f.description,
    })),
  ),
};

function makeRegistry(hasProvider = true) {
  return {
    list: vi.fn().mockReturnValue(hasProvider ? ["gitlab"] : []),
    get: vi.fn().mockReturnValue(hasProvider ? mockProvider : undefined),
    has: vi.fn().mockReturnValue(hasProvider),
    register: vi.fn(),
  };
}

const baseScanFindings = [
  { id: "f1", scanId: "scan-1", file: "src/app.ts", lineStart: 10, lineEnd: 12, severity: "medium", type: "xss", title: "XSS found", description: "Cross-site scripting", createdAt: new Date("2026-01-01") },
  { id: "f2", scanId: "scan-1", file: "src/db.ts", lineStart: 5, lineEnd: 5, severity: "critical", type: "sqli", title: "SQL injection", description: "Unsanitized input", createdAt: new Date("2026-01-02") },
  { id: "f3", scanId: "scan-1", file: "src/auth.ts", lineStart: 20, lineEnd: 25, severity: "low", type: "info-leak", title: "Info leak", description: "Verbose error", createdAt: new Date("2026-01-03") },
];

const mockDb = {
  scan: {
    findUnique: vi.fn().mockResolvedValue(null),
  },
  finding: {
    findMany: vi.fn().mockResolvedValue([...baseScanFindings]),
  },
};

const baseEvent: VcsResultEvent = {
  scanId: "scan-1",
  status: "completed",
  riskScore: 72,
};

const correlationData: Record<string, string> = {
  provider: "gitlab",
  installationId: "inst-42",
  owner: "mygroup",
  repo: "myrepo",
  commitHash: "abc123def",
  prNumber: "7",
  projectId: "99",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.finding.findMany.mockResolvedValue([...baseScanFindings]);
  mockDb.scan.findUnique.mockResolvedValue(null);
});

describe("handleVcsResult", () => {
  it("looks up provider from Redis correlation and calls reportStatus", async () => {
    const redis = makeMockRedis(correlationData);
    const registry = makeRegistry();
    const deps = { redis, db: mockDb, registry } as unknown as VcsResultsDeps;

    await handleVcsResult(baseEvent, deps);

    expect(redis.hgetall).toHaveBeenCalledWith("scan:vcs:gitlab:scan-1");
    expect(mockProvider.reportStatus).toHaveBeenCalledTimes(1);

    const [trigger, report] = mockProvider.reportStatus.mock.calls[0];
    expect(trigger.provider).toBe("gitlab");
    expect(trigger.commitHash).toBe("abc123def");
    expect(trigger.prNumber).toBe(7);
    expect(report.scanId).toBe("scan-1");
    expect(report.status).toBe("completed");
    expect(report.riskScore).toBe(72);
  });

  it("falls back to DB triggerMeta when Redis has no correlation", async () => {
    const redis = makeMockRedis(null); // Redis miss
    const registry = makeRegistry();
    mockDb.scan.findUnique.mockResolvedValue({
      id: "scan-1",
      commitHash: "abc123def",
      triggerMeta: {
        provider: "gitlab",
        installationId: "inst-42",
        owner: "mygroup",
        repo: "myrepo",
        prNumber: 7,
        projectId: 99,
      },
    });
    const deps = { redis, db: mockDb, registry } as unknown as VcsResultsDeps;

    await handleVcsResult(baseEvent, deps);

    expect(mockDb.scan.findUnique).toHaveBeenCalledWith({ where: { id: "scan-1" } });
    expect(mockProvider.reportStatus).toHaveBeenCalledTimes(1);
    const [trigger] = mockProvider.reportStatus.mock.calls[0];
    expect(trigger.provider).toBe("gitlab");
    expect(trigger.owner).toBe("mygroup");
  });

  it("skips gracefully when no VCS context exists", async () => {
    const redis = makeMockRedis(null);
    const registry = makeRegistry(false); // no providers registered
    mockDb.scan.findUnique.mockResolvedValue(null);
    const deps = { redis, db: mockDb, registry } as unknown as VcsResultsDeps;

    await handleVcsResult(baseEvent, deps);

    expect(mockProvider.reportStatus).not.toHaveBeenCalled();
  });

  it("cleans up Redis correlation key after reporting", async () => {
    const redis = makeMockRedis(correlationData);
    const registry = makeRegistry();
    const deps = { redis, db: mockDb, registry } as unknown as VcsResultsDeps;

    await handleVcsResult(baseEvent, deps);

    expect(redis.del).toHaveBeenCalledWith("scan:vcs:gitlab:scan-1");
  });

  it("sorts findings by severity before building annotations", async () => {
    const redis = makeMockRedis(correlationData);
    const registry = makeRegistry();
    const deps = { redis, db: mockDb, registry } as unknown as VcsResultsDeps;

    await handleVcsResult(baseEvent, deps);

    // formatAnnotations should have been called with findings sorted: critical, medium, low
    expect(mockProvider.formatAnnotations).toHaveBeenCalledTimes(1);
    const annotationInput = mockProvider.formatAnnotations.mock.calls[0][0] as any[];
    expect(annotationInput[0].severity).toBe("critical");
    expect(annotationInput[1].severity).toBe("medium");
    expect(annotationInput[2].severity).toBe("low");
  });
});
