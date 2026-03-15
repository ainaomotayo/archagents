import { describe, it, expect } from "vitest";
import { MOCK_FRAMEWORK_SCORES } from "@/lib/mock-data";
import { scoreToColor } from "../types";

describe("HeatmapGrid data logic", () => {
  it("computes unique control codes across frameworks", () => {
    const allCodes = Array.from(
      new Set(
        MOCK_FRAMEWORK_SCORES.flatMap((fw) =>
          fw.controlScores.map((c) => c.controlCode),
        ),
      ),
    );
    expect(allCodes.length).toBeGreaterThan(10);
    expect(allCodes).toContain("CC1.1");
    expect(allCodes).toContain("A.5");
    expect(allCodes).toContain("SL1");
  });

  it("filters frameworks by selected slugs", () => {
    const selected = ["soc2", "slsa"];
    const visible = MOCK_FRAMEWORK_SCORES.filter((fw) =>
      selected.includes(fw.frameworkSlug),
    );
    expect(visible).toHaveLength(2);
    expect(visible.map((fw) => fw.frameworkSlug)).toEqual(["soc2", "slsa"]);
  });

  it("shows all frameworks when no filter selected", () => {
    const selected: string[] = [];
    const visible =
      selected.length === 0
        ? MOCK_FRAMEWORK_SCORES
        : MOCK_FRAMEWORK_SCORES.filter((fw) =>
            selected.includes(fw.frameworkSlug),
          );
    expect(visible).toHaveLength(MOCK_FRAMEWORK_SCORES.length);
  });

  it("maps scores to correct heatmap colors", () => {
    const soc2 = MOCK_FRAMEWORK_SCORES.find((fw) => fw.frameworkSlug === "soc2")!;
    const cc8_1 = soc2.controlScores.find((c) => c.controlCode === "CC8.1")!;
    expect(cc8_1.score).toBe(0.97);
    expect(scoreToColor(cc8_1.score)).toBe("green");

    const cc6_3 = soc2.controlScores.find((c) => c.controlCode === "CC6.3")!;
    expect(cc6_3.score).toBe(0.55);
    expect(scoreToColor(cc6_3.score)).toBe("red");
  });
});

describe("SummaryCards data logic", () => {
  it("computes average score across all frameworks", () => {
    const avg =
      MOCK_FRAMEWORK_SCORES.reduce((sum, fw) => sum + fw.score, 0) /
      MOCK_FRAMEWORK_SCORES.length;
    expect(Math.round(avg * 100)).toBeGreaterThan(0);
    expect(Math.round(avg * 100)).toBeLessThan(100);
  });

  it("counts met vs unmet controls", () => {
    const total = MOCK_FRAMEWORK_SCORES.reduce(
      (sum, fw) => sum + fw.controlScores.length,
      0,
    );
    const met = MOCK_FRAMEWORK_SCORES.reduce(
      (sum, fw) =>
        sum + fw.controlScores.filter((c) => c.score >= 0.80).length,
      0,
    );
    expect(met).toBeGreaterThan(0);
    expect(total - met).toBeGreaterThan(0);
  });
});
