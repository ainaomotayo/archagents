import { describe, test, expect, vi } from "vitest";
import { buildRetentionQuery, DEFAULT_RETENTION_DAYS, runRetentionCleanup } from "../data-retention.js";

describe("data-retention", () => {
  test("DEFAULT_RETENTION_DAYS is 90", () => {
    expect(DEFAULT_RETENTION_DAYS).toBe(90);
  });

  test("buildRetentionQuery returns correct cutoff date and table list", () => {
    const now = new Date("2026-03-09T00:00:00Z");
    const result = buildRetentionQuery(90, now);
    expect(result.cutoffDate).toEqual(new Date("2025-12-09T00:00:00Z"));
    expect(result.tables).toEqual(["findings", "agentResults", "scans"]);
  });

  test("buildRetentionQuery respects custom days", () => {
    const now = new Date("2026-03-09T00:00:00Z");
    const result = buildRetentionQuery(30, now);
    expect(result.cutoffDate).toEqual(new Date("2026-02-07T00:00:00Z"));
  });

  test("chunked deletion processes in batches", async () => {
    const mockIds = [{ id: "f1" }, { id: "f2" }, { id: "f3" }];
    const db = {
      finding: {
        findMany: vi.fn()
          .mockResolvedValueOnce(mockIds)
          .mockResolvedValueOnce([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      agentResult: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      scan: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const result = await runRetentionCleanup(db as any, 90);
    expect(result.deletedFindings).toBe(3);
    expect(result.deletedAgentResults).toBe(0);
    expect(result.deletedScans).toBe(0);
    expect(db.finding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1000 }),
    );
    expect(db.finding.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["f1", "f2", "f3"] } },
    });
  });

  test("per-org retention uses custom retentionDays", async () => {
    const db = {
      finding: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      agentResult: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      scan: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    await runRetentionCleanup(db as any, 180);
    const findCall = db.finding.findMany.mock.calls[0][0];
    const cutoff = findCall.where.createdAt.lt;
    const now = new Date();
    const daysDiff = Math.round((now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24));
    expect(daysDiff).toBeGreaterThanOrEqual(179);
    expect(daysDiff).toBeLessThanOrEqual(181);
  });
});
