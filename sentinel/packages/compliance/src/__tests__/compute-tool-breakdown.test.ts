import { describe, it, expect } from "vitest";
import { computeToolBreakdown } from "../ai-metrics/compute-tool-breakdown.js";
import type { FileSignal } from "../ai-metrics/compute-ai-ratio.js";

function makeSignal(
  overrides: Partial<FileSignal> & { file: string },
): FileSignal {
  return {
    loc: 100,
    aiProbability: 0.8,
    markerTools: [],
    estimatedTool: null,
    ...overrides,
  };
}

describe("computeToolBreakdown", () => {
  it("returns empty array for empty list", () => {
    expect(computeToolBreakdown([], 0.5)).toEqual([]);
  });

  it("groups confirmed tools from markerTools", () => {
    const files = [
      makeSignal({ file: "a.ts", markerTools: ["copilot"], loc: 100 }),
      makeSignal({ file: "b.ts", markerTools: ["copilot"], loc: 200 }),
    ];
    const result = computeToolBreakdown(files, 0.5);
    expect(result).toHaveLength(1);
    expect(result[0].tool).toBe("copilot");
    expect(result[0].confirmedFiles).toBe(2);
    expect(result[0].estimatedFiles).toBe(0);
    expect(result[0].totalLoc).toBe(300);
    expect(result[0].percentage).toBeCloseTo(100);
  });

  it("groups estimated tools separately", () => {
    const files = [
      makeSignal({ file: "a.ts", markerTools: ["copilot"], loc: 100 }),
      makeSignal({ file: "b.ts", estimatedTool: "claude", loc: 200 }),
    ];
    const result = computeToolBreakdown(files, 0.5);
    expect(result).toHaveLength(2);
    const claude = result.find((e) => e.tool === "claude")!;
    expect(claude.confirmedFiles).toBe(0);
    expect(claude.estimatedFiles).toBe(1);
  });

  it("only includes files above threshold", () => {
    const files = [
      makeSignal({
        file: "a.ts",
        aiProbability: 0.9,
        markerTools: ["copilot"],
        loc: 100,
      }),
      makeSignal({
        file: "b.ts",
        aiProbability: 0.2,
        markerTools: ["copilot"],
        loc: 500,
      }),
    ];
    const result = computeToolBreakdown(files, 0.5);
    expect(result).toHaveLength(1);
    expect(result[0].totalLoc).toBe(100);
  });

  it("computes correct percentages", () => {
    const files = [
      makeSignal({ file: "a.ts", markerTools: ["copilot"], loc: 300 }),
      makeSignal({ file: "b.ts", estimatedTool: "claude", loc: 100 }),
    ];
    const result = computeToolBreakdown(files, 0.5);
    const copilot = result.find((e) => e.tool === "copilot")!;
    const claude = result.find((e) => e.tool === "claude")!;
    expect(copilot.percentage).toBeCloseTo(75);
    expect(claude.percentage).toBeCloseTo(25);
  });

  it("sorts by LOC descending", () => {
    const files = [
      makeSignal({ file: "a.ts", markerTools: ["copilot"], loc: 50 }),
      makeSignal({ file: "b.ts", estimatedTool: "claude", loc: 200 }),
      makeSignal({ file: "c.ts", markerTools: ["cursor"], loc: 100 }),
    ];
    const result = computeToolBreakdown(files, 0.5);
    expect(result[0].tool).toBe("claude");
    expect(result[1].tool).toBe("cursor");
    expect(result[2].tool).toBe("copilot");
  });

  it("uses first marker tool when multiple are present", () => {
    const files = [
      makeSignal({
        file: "a.ts",
        markerTools: ["copilot", "claude"],
        loc: 100,
      }),
    ];
    const result = computeToolBreakdown(files, 0.5);
    expect(result).toHaveLength(1);
    expect(result[0].tool).toBe("copilot");
    expect(result[0].confirmedFiles).toBe(1);
  });

  it("buckets files with no tool info as unknown estimated", () => {
    const files = [makeSignal({ file: "a.ts", loc: 100 })];
    const result = computeToolBreakdown(files, 0.5);
    expect(result).toHaveLength(1);
    expect(result[0].tool).toBe("unknown");
    expect(result[0].estimatedFiles).toBe(1);
    expect(result[0].confirmedFiles).toBe(0);
  });
});
