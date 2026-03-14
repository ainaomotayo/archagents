"use client";

import type { AIMetricsStats, AITrendResult } from "@/lib/types";

// ── Helpers (exported for testing) ─────────────────────

export function formatRatio(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatMoMChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${(change * 100).toFixed(1)}%`;
}

interface StatCard {
  label: string;
  value: string;
  sub: string;
  trend?: string;
}

export function getStatCards(
  stats: AIMetricsStats,
  trend: AITrendResult,
): StatCard[] {
  const noData = !stats.hasData;
  const s = stats.stats;

  return [
    {
      label: "AI Code Ratio",
      value: noData ? "--" : formatRatio(s.aiRatio),
      sub: noData ? "No data" : `${s.aiLoc.toLocaleString()} / ${s.totalLoc.toLocaleString()} LOC`,
      trend: noData ? undefined : formatMoMChange(trend.momChange),
    },
    {
      label: "AI Influence",
      value: noData ? "--" : formatRatio(s.aiInfluenceScore),
      sub: noData ? "No data" : `7d avg: ${formatRatio(trend.movingAvg7d)}`,
    },
    {
      label: "AI Files",
      value: noData ? "--" : s.aiFiles.toLocaleString(),
      sub: noData ? "No data" : `of ${s.totalFiles.toLocaleString()} total`,
    },
    {
      label: "AI Tools",
      value: noData ? "--" : stats.toolBreakdown.length.toString(),
      sub: noData ? "No data" : stats.toolBreakdown.map((t) => t.tool).join(", "),
    },
    {
      label: "P95 Probability",
      value: noData ? "--" : formatRatio(s.p95Probability),
      sub: noData ? "No data" : `Median: ${formatRatio(s.medianProbability)}`,
    },
  ];
}

// ── Component ──────────────────────────────────────────

interface Props {
  stats: AIMetricsStats;
  trend: AITrendResult;
}

export function AIMetricsStatCards({ stats, trend }: Props) {
  const cards = getStatCards(stats, trend);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card, i) => (
        <div
          key={card.label}
          className="animate-fade-up relative overflow-hidden rounded-xl border border-border bg-surface-1 p-4"
          style={{ animationDelay: `${0.03 * i}s` }}
        >
          {/* gradient overlay */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent" />

          <p className="relative text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
            {card.label}
          </p>
          <p className="relative mt-1 text-[22px] font-bold leading-tight text-text-primary">
            {card.value}
          </p>
          <p className="relative mt-1 truncate text-[11px] text-text-secondary">
            {card.sub}
          </p>

          {card.trend && (
            <p
              className={`relative mt-1 text-[11px] font-medium ${
                card.trend.startsWith("+")
                  ? "text-status-warn"
                  : "text-status-pass"
              }`}
            >
              {card.trend}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
