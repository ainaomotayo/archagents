import { describe, it, expect } from "vitest";
import { computeTrends } from "../ai-metrics/compute-trends.js";
import { selectGranularity } from "../ai-metrics/compute-granularity.js";
import type { SnapshotInput } from "../ai-metrics/compute-trends.js";

function makeSnapshot(overrides: Partial<SnapshotInput> & { snapshotDate: Date }): SnapshotInput {
  return {
    aiRatio: 0.5,
    aiInfluenceScore: 0.3,
    scanCount: 1,
    ...overrides,
  };
}

describe("selectGranularity", () => {
  it("returns daily for 90 days or fewer", () => {
    expect(selectGranularity(1)).toBe("daily");
    expect(selectGranularity(90)).toBe("daily");
  });

  it("returns weekly for 91–365 days", () => {
    expect(selectGranularity(91)).toBe("weekly");
    expect(selectGranularity(365)).toBe("weekly");
  });

  it("returns monthly for more than 365 days", () => {
    expect(selectGranularity(366)).toBe("monthly");
    expect(selectGranularity(1000)).toBe("monthly");
  });
});

describe("computeTrends", () => {
  it("returns empty result for no snapshots", () => {
    const result = computeTrends([], 30);
    expect(result).toEqual({
      points: [],
      momChange: 0,
      movingAvg7d: 0,
      movingAvg30d: 0,
    });
  });

  it("maps snapshots to trend points with correct date format", () => {
    const snapshots = [
      makeSnapshot({ snapshotDate: new Date("2026-03-01"), aiRatio: 0.3, aiInfluenceScore: 0.2, scanCount: 5 }),
      makeSnapshot({ snapshotDate: new Date("2026-03-02"), aiRatio: 0.4, aiInfluenceScore: 0.3, scanCount: 10 }),
    ];
    const result = computeTrends(snapshots, 30);
    expect(result.points).toHaveLength(2);
    expect(result.points[0].date).toBe("2026-03-01");
    expect(result.points[0].aiRatio).toBe(0.3);
    expect(result.points[1].scanCount).toBe(10);
  });

  it("sorts snapshots by date ascending", () => {
    const snapshots = [
      makeSnapshot({ snapshotDate: new Date("2026-03-05"), aiRatio: 0.5 }),
      makeSnapshot({ snapshotDate: new Date("2026-03-01"), aiRatio: 0.1 }),
      makeSnapshot({ snapshotDate: new Date("2026-03-03"), aiRatio: 0.3 }),
    ];
    const result = computeTrends(snapshots, 30);
    expect(result.points[0].date).toBe("2026-03-01");
    expect(result.points[1].date).toBe("2026-03-03");
    expect(result.points[2].date).toBe("2026-03-05");
  });

  it("computes 7-day moving average", () => {
    const snapshots = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot({
        snapshotDate: new Date(`2026-03-${String(i + 1).padStart(2, "0")}`),
        aiRatio: (i + 1) * 0.1, // 0.1 through 1.0
      }),
    );
    const result = computeTrends(snapshots, 30);
    // Last 7 points: 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0 → avg = 0.7
    expect(result.movingAvg7d).toBeCloseTo(0.7);
  });

  it("computes MoM change", () => {
    const snapshots = [
      makeSnapshot({ snapshotDate: new Date("2026-02-15"), aiRatio: 0.2 }),
      makeSnapshot({ snapshotDate: new Date("2026-02-20"), aiRatio: 0.4 }),
      makeSnapshot({ snapshotDate: new Date("2026-03-10"), aiRatio: 0.6 }),
    ];
    const result = computeTrends(snapshots, 90);
    // prev month avg = (0.2+0.4)/2 = 0.3, current month avg = 0.6
    // MoM = (0.6 - 0.3) / 0.3 = 1.0
    expect(result.momChange).toBeCloseTo(1.0);
  });

  it("returns 0 MoM when no previous month data", () => {
    const snapshots = [
      makeSnapshot({ snapshotDate: new Date("2026-03-10"), aiRatio: 0.5 }),
    ];
    const result = computeTrends(snapshots, 30);
    expect(result.momChange).toBe(0);
  });

  it("handles single snapshot", () => {
    const snapshots = [
      makeSnapshot({ snapshotDate: new Date("2026-03-10"), aiRatio: 0.5 }),
    ];
    const result = computeTrends(snapshots, 30);
    expect(result.points).toHaveLength(1);
    expect(result.movingAvg7d).toBeCloseTo(0.5);
    expect(result.movingAvg30d).toBeCloseTo(0.5);
  });

  it("computes 30-day moving average with fewer than 30 points", () => {
    const snapshots = [
      makeSnapshot({ snapshotDate: new Date("2026-03-01"), aiRatio: 0.2 }),
      makeSnapshot({ snapshotDate: new Date("2026-03-02"), aiRatio: 0.4 }),
      makeSnapshot({ snapshotDate: new Date("2026-03-03"), aiRatio: 0.6 }),
    ];
    const result = computeTrends(snapshots, 30);
    // All 3 points → avg = (0.2+0.4+0.6)/3 = 0.4
    expect(result.movingAvg30d).toBeCloseTo(0.4);
  });
});
