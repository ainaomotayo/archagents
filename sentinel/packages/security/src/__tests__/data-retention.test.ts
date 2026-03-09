import { describe, test, expect } from "vitest";
import { buildRetentionQuery, DEFAULT_RETENTION_DAYS } from "../data-retention.js";

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
});
