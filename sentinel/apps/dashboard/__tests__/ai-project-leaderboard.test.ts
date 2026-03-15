import { describe, it, expect } from "vitest";
import {
  SORT_OPTIONS,
  formatProjectRatio,
} from "@/components/ai-metrics/ai-project-leaderboard";

describe("SORT_OPTIONS", () => {
  it("has 4 sort keys", () => {
    expect(SORT_OPTIONS).toHaveLength(4);
  });

  it("contains expected keys", () => {
    const keys = SORT_OPTIONS.map((o) => o.key);
    expect(keys).toEqual(["aiRatio", "aiInfluenceScore", "aiFiles", "totalFiles"]);
  });

  it("contains human-readable labels", () => {
    const labels = SORT_OPTIONS.map((o) => o.label);
    expect(labels).toEqual(["AI Ratio", "Influence", "AI Files", "Total Files"]);
  });
});

describe("formatProjectRatio", () => {
  it("formats as percentage with one decimal", () => {
    expect(formatProjectRatio(0.35)).toBe("35.0%");
  });

  it("handles zero", () => {
    expect(formatProjectRatio(0)).toBe("0.0%");
  });

  it("handles small values", () => {
    expect(formatProjectRatio(0.001)).toBe("0.1%");
  });
});
