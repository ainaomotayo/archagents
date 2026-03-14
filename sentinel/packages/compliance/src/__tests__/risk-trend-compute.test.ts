import { describe, it, expect } from "vitest";
import { fillGaps } from "../risk-trend/compute.js";

describe("fillGaps", () => {
  it("returns empty array for empty input", () => {
    const result = fillGaps([], "2026-01-01", "2026-01-05");
    expect(result).toEqual([]);
  });

  it("carry-forwards score across missing days", () => {
    const points = [
      { date: "2026-01-01", score: 70 },
      { date: "2026-01-04", score: 60 },
    ];
    const result = fillGaps(points, "2026-01-01", "2026-01-05");
    expect(result).toEqual([
      { date: "2026-01-01", score: 70 },
      { date: "2026-01-02", score: 70 },
      { date: "2026-01-03", score: 70 },
      { date: "2026-01-04", score: 60 },
      { date: "2026-01-05", score: 60 },
    ]);
  });

  it("does not fill before first data point", () => {
    const points = [{ date: "2026-01-03", score: 50 }];
    const result = fillGaps(points, "2026-01-01", "2026-01-05");
    expect(result).toEqual([
      { date: "2026-01-03", score: 50 },
      { date: "2026-01-04", score: 50 },
      { date: "2026-01-05", score: 50 },
    ]);
  });

  it("handles single point on start date", () => {
    const points = [{ date: "2026-01-01", score: 80 }];
    const result = fillGaps(points, "2026-01-01", "2026-01-03");
    expect(result).toEqual([
      { date: "2026-01-01", score: 80 },
      { date: "2026-01-02", score: 80 },
      { date: "2026-01-03", score: 80 },
    ]);
  });

  it("handles consecutive days with no gaps", () => {
    const points = [
      { date: "2026-01-01", score: 70 },
      { date: "2026-01-02", score: 65 },
      { date: "2026-01-03", score: 60 },
    ];
    const result = fillGaps(points, "2026-01-01", "2026-01-03");
    expect(result).toEqual(points);
  });
});
