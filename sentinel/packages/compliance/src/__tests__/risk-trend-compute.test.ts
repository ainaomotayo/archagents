import { describe, it, expect } from "vitest";
import { fillGaps, computeDirection, computeChangePercent } from "../risk-trend/compute.js";

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

describe("computeDirection", () => {
  it("returns 'flat' for empty points", () => {
    expect(computeDirection([])).toBe("flat");
  });

  it("returns 'flat' for single point", () => {
    expect(computeDirection([{ date: "2026-01-01", score: 50 }])).toBe("flat");
  });

  it("returns 'up' when later scores are higher", () => {
    const points = [
      { date: "2026-01-01", score: 30 },
      { date: "2026-01-02", score: 40 },
      { date: "2026-01-03", score: 50 },
      { date: "2026-01-04", score: 55 },
      { date: "2026-01-05", score: 60 },
      { date: "2026-01-06", score: 65 },
    ];
    expect(computeDirection(points)).toBe("up");
  });

  it("returns 'down' when later scores are lower", () => {
    const points = [
      { date: "2026-01-01", score: 80 },
      { date: "2026-01-02", score: 75 },
      { date: "2026-01-03", score: 70 },
      { date: "2026-01-04", score: 50 },
      { date: "2026-01-05", score: 45 },
      { date: "2026-01-06", score: 40 },
    ];
    expect(computeDirection(points)).toBe("down");
  });

  it("returns 'flat' when scores are roughly equal", () => {
    const points = [
      { date: "2026-01-01", score: 50 },
      { date: "2026-01-02", score: 51 },
      { date: "2026-01-03", score: 50 },
    ];
    expect(computeDirection(points)).toBe("flat");
  });
});

describe("computeChangePercent", () => {
  it("returns 0 for empty points", () => {
    expect(computeChangePercent([])).toBe(0);
  });

  it("returns 0 for single point", () => {
    expect(computeChangePercent([{ date: "2026-01-01", score: 50 }])).toBe(0);
  });

  it("computes positive change", () => {
    const points = [
      { date: "2026-01-01", score: 50 },
      { date: "2026-01-02", score: 60 },
    ];
    expect(computeChangePercent(points)).toBe(20);
  });

  it("computes negative change", () => {
    const points = [
      { date: "2026-01-01", score: 80 },
      { date: "2026-01-02", score: 60 },
    ];
    expect(computeChangePercent(points)).toBe(-25);
  });

  it("returns 0 when first score is 0", () => {
    const points = [
      { date: "2026-01-01", score: 0 },
      { date: "2026-01-02", score: 50 },
    ];
    expect(computeChangePercent(points)).toBe(0);
  });
});
