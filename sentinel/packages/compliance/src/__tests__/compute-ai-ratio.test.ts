import { describe, it, expect } from "vitest";
import {
  computeAIRatio,
  type FileSignal,
} from "../ai-metrics/compute-ai-ratio.js";

function makeSignal(
  overrides: Partial<FileSignal> & { file: string },
): FileSignal {
  return {
    loc: 100,
    aiProbability: 0.5,
    markerTools: [],
    estimatedTool: null,
    ...overrides,
  };
}

describe("computeAIRatio", () => {
  it("returns all zeros for empty file list", () => {
    const result = computeAIRatio([], 0.5);
    expect(result).toEqual({
      aiRatio: 0,
      aiFiles: 0,
      totalFiles: 0,
      aiLoc: 0,
      totalLoc: 0,
      aiInfluenceScore: 0,
      avgProbability: 0,
      medianProbability: 0,
      p95Probability: 0,
    });
  });

  it("classifies files above and below threshold correctly", () => {
    const files = [
      makeSignal({ file: "a.ts", aiProbability: 0.8, loc: 100 }),
      makeSignal({ file: "b.ts", aiProbability: 0.3, loc: 200 }),
      makeSignal({ file: "c.ts", aiProbability: 0.6, loc: 150 }),
    ];
    const result = computeAIRatio(files, 0.5);
    expect(result.aiFiles).toBe(2);
    expect(result.totalFiles).toBe(3);
  });

  it("computes LOC-weighted aiRatio", () => {
    const files = [
      makeSignal({ file: "a.ts", aiProbability: 0.9, loc: 300 }),
      makeSignal({ file: "b.ts", aiProbability: 0.1, loc: 100 }),
    ];
    const result = computeAIRatio(files, 0.5);
    // AI LOC = 300, total LOC = 400
    expect(result.aiRatio).toBeCloseTo(0.75);
    expect(result.aiLoc).toBe(300);
    expect(result.totalLoc).toBe(400);
  });

  it("computes fractional influence score across all files", () => {
    const files = [
      makeSignal({ file: "a.ts", aiProbability: 0.8, loc: 200 }),
      makeSignal({ file: "b.ts", aiProbability: 0.2, loc: 200 }),
    ];
    const result = computeAIRatio(files, 0.5);
    // influence = (0.8*200 + 0.2*200) / 400 = 200/400 = 0.5
    expect(result.aiInfluenceScore).toBeCloseTo(0.5);
  });

  it("handles all-AI case", () => {
    const files = [
      makeSignal({ file: "a.ts", aiProbability: 0.9, loc: 100 }),
      makeSignal({ file: "b.ts", aiProbability: 0.7, loc: 200 }),
    ];
    const result = computeAIRatio(files, 0.5);
    expect(result.aiFiles).toBe(2);
    expect(result.aiRatio).toBeCloseTo(1.0);
  });

  it("handles no-AI case", () => {
    const files = [
      makeSignal({ file: "a.ts", aiProbability: 0.1, loc: 100 }),
      makeSignal({ file: "b.ts", aiProbability: 0.2, loc: 200 }),
    ];
    const result = computeAIRatio(files, 0.5);
    expect(result.aiFiles).toBe(0);
    expect(result.aiRatio).toBe(0);
    expect(result.aiLoc).toBe(0);
  });

  it("classifies file at exactly threshold as AI", () => {
    const files = [makeSignal({ file: "a.ts", aiProbability: 0.5, loc: 100 })];
    const result = computeAIRatio(files, 0.5);
    expect(result.aiFiles).toBe(1);
  });

  it("computes correct percentiles (avg, median, p95)", () => {
    // probabilities: 0.1, 0.2, 0.3, 0.5, 0.9
    const files = [
      makeSignal({ file: "a.ts", aiProbability: 0.1, loc: 10 }),
      makeSignal({ file: "b.ts", aiProbability: 0.5, loc: 10 }),
      makeSignal({ file: "c.ts", aiProbability: 0.3, loc: 10 }),
      makeSignal({ file: "d.ts", aiProbability: 0.9, loc: 10 }),
      makeSignal({ file: "e.ts", aiProbability: 0.2, loc: 10 }),
    ];
    const result = computeAIRatio(files, 0.5);
    // avg = (0.1+0.5+0.3+0.9+0.2)/5 = 0.4
    expect(result.avgProbability).toBeCloseTo(0.4);
    // sorted: [0.1, 0.2, 0.3, 0.5, 0.9], median = index 2 = 0.3
    expect(result.medianProbability).toBeCloseTo(0.3);
    // p95: idx = 0.95*4 = 3.8, lerp between sorted[3]=0.5 and sorted[4]=0.9
    // 0.5 + (0.9-0.5)*0.8 = 0.5 + 0.32 = 0.82
    expect(result.p95Probability).toBeCloseTo(0.82);
  });

  it("handles single file", () => {
    const files = [makeSignal({ file: "a.ts", aiProbability: 0.7, loc: 50 })];
    const result = computeAIRatio(files, 0.5);
    expect(result.aiFiles).toBe(1);
    expect(result.totalFiles).toBe(1);
    expect(result.aiRatio).toBeCloseTo(1.0);
    expect(result.medianProbability).toBeCloseTo(0.7);
    expect(result.p95Probability).toBeCloseTo(0.7);
  });

  it("handles files with 0 LOC", () => {
    const files = [
      makeSignal({ file: "a.ts", aiProbability: 0.9, loc: 0 }),
      makeSignal({ file: "b.ts", aiProbability: 0.1, loc: 0 }),
    ];
    const result = computeAIRatio(files, 0.5);
    expect(result.totalLoc).toBe(0);
    expect(result.aiRatio).toBe(0);
    expect(result.aiInfluenceScore).toBe(0);
  });
});
