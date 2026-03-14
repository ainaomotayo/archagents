import { describe, it, expect } from "vitest";
import {
  formatRatio,
  formatMoMChange,
  getStatCards,
} from "@/components/ai-metrics/ai-metrics-stat-cards";
import type { AIMetricsStats, AITrendResult } from "@/lib/types";

describe("formatRatio", () => {
  it("converts decimal ratio to percentage string", () => {
    expect(formatRatio(0.234)).toBe("23.4%");
  });

  it("handles zero", () => {
    expect(formatRatio(0)).toBe("0.0%");
  });

  it("handles 1.0", () => {
    expect(formatRatio(1)).toBe("100.0%");
  });
});

describe("formatMoMChange", () => {
  it("shows positive change with + prefix", () => {
    expect(formatMoMChange(0.15)).toBe("+15.0%");
  });

  it("shows negative change with - prefix", () => {
    expect(formatMoMChange(-0.08)).toBe("-8.0%");
  });

  it("shows zero as +0.0%", () => {
    expect(formatMoMChange(0)).toBe("+0.0%");
  });
});

describe("getStatCards", () => {
  const stats: AIMetricsStats = {
    hasData: true,
    stats: {
      aiRatio: 0.234,
      aiFiles: 120,
      totalFiles: 500,
      aiLoc: 5000,
      totalLoc: 20000,
      aiInfluenceScore: 0.45,
      avgProbability: 0.6,
      medianProbability: 0.55,
      p95Probability: 0.92,
    },
    toolBreakdown: [
      { tool: "copilot", confirmedFiles: 80, estimatedFiles: 20, totalLoc: 3000, percentage: 60 },
      { tool: "claude", confirmedFiles: 40, estimatedFiles: 10, totalLoc: 2000, percentage: 40 },
    ],
  };

  const trend: AITrendResult = {
    points: [],
    momChange: 0.15,
    movingAvg7d: 0.22,
    movingAvg30d: 0.20,
  };

  it("returns 5 cards", () => {
    const cards = getStatCards(stats, trend);
    expect(cards).toHaveLength(5);
  });

  it("returns correct labels", () => {
    const labels = getStatCards(stats, trend).map((c) => c.label);
    expect(labels).toEqual([
      "AI Code Ratio",
      "AI Influence",
      "AI Files",
      "AI Tools",
      "P95 Probability",
    ]);
  });

  it("formats values correctly when data exists", () => {
    const cards = getStatCards(stats, trend);
    expect(cards[0].value).toBe("23.4%");
    expect(cards[2].value).toBe("120");
    expect(cards[3].value).toBe("2");
    expect(cards[4].value).toBe("92.0%");
  });

  it("handles no-data state", () => {
    const noDataStats: AIMetricsStats = {
      ...stats,
      hasData: false,
    };
    const cards = getStatCards(noDataStats, trend);
    for (const card of cards) {
      expect(card.value).toBe("--");
      expect(card.sub).toBe("No data");
    }
  });
});
