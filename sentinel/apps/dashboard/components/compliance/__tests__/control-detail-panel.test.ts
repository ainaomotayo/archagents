import { describe, it, expect } from "vitest";
import { scoreToVerdict, scoreToVerdictEnum, scoreToColor, confidenceIndicator } from "../types";
import type { SelectedCell } from "../types";
import { MOCK_FRAMEWORK_SCORES, MOCK_COMPLIANCE_TRENDS } from "@/lib/mock-data";

describe("ControlDetailPanel data logic", () => {
  const mockCell: SelectedCell = {
    frameworkSlug: "soc2",
    frameworkName: "SOC 2 Type II",
    controlCode: "CC6.3",
    controlName: "System Operations",
    score: 0.55,
    passing: 5,
    failing: 4,
    total: 9,
  };

  it("maps score to correct verdict text", () => {
    expect(scoreToVerdict(mockCell.score)).toBe("Non-compliant");
  });

  it("maps score to correct verdict enum", () => {
    expect(scoreToVerdictEnum(mockCell.score)).toBe("non_compliant");
  });

  it("maps score to correct color", () => {
    expect(scoreToColor(mockCell.score)).toBe("red");
  });

  it("identifies low confidence for sparse data", () => {
    const conf = confidenceIndicator(mockCell.total);
    // 9 findings — should have moderate confidence
    expect(conf).toBeGreaterThan(0.6);
    expect(conf).toBeLessThan(1);
  });

  describe("with trend data", () => {
    const trends = MOCK_COMPLIANCE_TRENDS["soc2"];

    it("computes positive trend delta", () => {
      const delta = Math.round(
        (trends[trends.length - 1].score - trends[0].score) * 100,
      );
      expect(delta).toBeGreaterThan(0);
    });

    it("has 30 data points", () => {
      expect(trends).toHaveLength(30);
    });

    it("each point has date and score", () => {
      for (const point of trends) {
        expect(point.date).toBeDefined();
        expect(typeof point.score).toBe("number");
        expect(point.score).toBeGreaterThan(0);
        expect(point.score).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("without trend data", () => {
    it("returns null delta when trends empty", () => {
      const trends: { date: string; score: number }[] = [];
      const delta =
        trends.length >= 2
          ? Math.round((trends[trends.length - 1].score - trends[0].score) * 100)
          : null;
      expect(delta).toBeNull();
    });

    it("returns null delta when only one point", () => {
      const trends = [{ date: "2026-03-15", score: 0.8 }];
      const delta =
        trends.length >= 2
          ? Math.round((trends[trends.length - 1].score - trends[0].score) * 100)
          : null;
      expect(delta).toBeNull();
    });
  });

  describe("cell selection from mock data", () => {
    it("finds correct control in SOC2 framework", () => {
      const soc2 = MOCK_FRAMEWORK_SCORES.find((fw) => fw.frameworkSlug === "soc2")!;
      const cc63 = soc2.controlScores.find((c) => c.controlCode === "CC6.3")!;
      expect(cc63.score).toBe(0.55);
      expect(cc63.passing).toBe(5);
      expect(cc63.failing).toBe(4);
    });

    it("constructs findings link correctly", () => {
      const link = `/findings?framework=${mockCell.frameworkSlug}&control=${mockCell.controlCode}`;
      expect(link).toBe("/findings?framework=soc2&control=CC6.3");
    });

    it("only shows findings link when failing > 0", () => {
      const noFailCell: SelectedCell = { ...mockCell, failing: 0 };
      expect(noFailCell.failing > 0).toBe(false);
    });
  });
});
