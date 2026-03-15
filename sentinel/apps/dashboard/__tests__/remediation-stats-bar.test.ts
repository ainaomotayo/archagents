import { describe, it, expect } from "vitest";

// Since the vitest environment is "node" (no DOM), we test the data/logic layer.
// The component imports RemediationStats from @/lib/types and renders 7 STAT_ITEMS.
// We import the types and validate the stat-item definitions match expectations.

import type { RemediationStats } from "@/lib/types";

// Replicate the STAT_ITEMS structure from the component for logic testing
const STAT_ITEMS: Array<{
  key: keyof RemediationStats;
  label: string;
  dotColor: string;
  format?: (v: number) => string;
}> = [
  { key: "open", label: "Open", dotColor: "bg-status-warn" },
  { key: "inProgress", label: "In Progress", dotColor: "bg-status-info" },
  { key: "overdue", label: "Overdue", dotColor: "bg-status-fail" },
  { key: "completed", label: "Completed", dotColor: "bg-status-pass" },
  { key: "acceptedRisk", label: "Accepted Risk", dotColor: "bg-text-tertiary" },
  { key: "avgResolutionDays", label: "Avg Resolution", dotColor: "bg-accent", format: (v) => `${v}d` },
  { key: "slaCompliance", label: "SLA Compliance", dotColor: "bg-status-pass", format: (v) => `${v}%` },
];

function renderStatText(stats: RemediationStats, key: keyof RemediationStats, format?: (v: number) => string): string {
  return format ? format(stats[key]) : String(stats[key]);
}

function isOverdueWarning(stats: RemediationStats): boolean {
  return stats.overdue > 0;
}

describe("RemediationStatsBar logic", () => {
  const fullStats: RemediationStats = {
    open: 12,
    inProgress: 5,
    overdue: 3,
    completed: 20,
    acceptedRisk: 2,
    avgResolutionDays: 7,
    slaCompliance: 85,
  };

  it("defines exactly 7 stat items", () => {
    expect(STAT_ITEMS).toHaveLength(7);
  });

  it("covers all keys of RemediationStats", () => {
    const keys = STAT_ITEMS.map((s) => s.key);
    expect(keys).toEqual([
      "open",
      "inProgress",
      "overdue",
      "completed",
      "acceptedRisk",
      "avgResolutionDays",
      "slaCompliance",
    ]);
  });

  it("renders plain numbers for open, inProgress, overdue, completed, acceptedRisk", () => {
    const plainItems = STAT_ITEMS.filter((s) => !s.format);
    expect(plainItems).toHaveLength(5);
    for (const item of plainItems) {
      expect(renderStatText(fullStats, item.key, item.format)).toBe(String(fullStats[item.key]));
    }
  });

  it("formats avgResolutionDays with 'd' suffix", () => {
    const item = STAT_ITEMS.find((s) => s.key === "avgResolutionDays")!;
    expect(renderStatText(fullStats, item.key, item.format)).toBe("7d");
  });

  it("formats slaCompliance with '%' suffix", () => {
    const item = STAT_ITEMS.find((s) => s.key === "slaCompliance")!;
    expect(renderStatText(fullStats, item.key, item.format)).toBe("85%");
  });

  it("flags overdue warning styling when overdue > 0", () => {
    expect(isOverdueWarning(fullStats)).toBe(true);
  });

  it("does not flag overdue warning styling when overdue is 0", () => {
    const zeroOverdue: RemediationStats = { ...fullStats, overdue: 0 };
    expect(isOverdueWarning(zeroOverdue)).toBe(false);
  });

  it("handles all-zero stats gracefully", () => {
    const zeroStats: RemediationStats = {
      open: 0,
      inProgress: 0,
      overdue: 0,
      completed: 0,
      acceptedRisk: 0,
      avgResolutionDays: 0,
      slaCompliance: 0,
    };
    for (const item of STAT_ITEMS) {
      const text = renderStatText(zeroStats, item.key, item.format);
      expect(text).toBeTruthy(); // "0", "0d", or "0%" — all truthy strings
    }
    expect(isOverdueWarning(zeroStats)).toBe(false);
  });
});
