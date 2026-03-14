"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { AITrendPoint } from "@/lib/types";

const PERIOD_OPTIONS = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "6m", days: 180 },
  { label: "1y", days: 365 },
] as const;

interface Props {
  points: AITrendPoint[];
  onPeriodChange?: (days: number) => void;
  activePeriod?: number;
}

export function AIMetricsTrendChart({
  points,
  onPeriodChange,
  activePeriod = 30,
}: Props) {
  const [period, setPeriod] = useState(activePeriod);

  const data = points.map((p) => ({
    date: p.date,
    ratio: +(p.aiRatio * 100).toFixed(1),
    influence: +(p.aiInfluenceScore * 100).toFixed(1),
  }));

  function handlePeriod(days: number) {
    setPeriod(days);
    onPeriodChange?.(days);
  }

  return (
    <div className="animate-fade-up rounded-xl border border-border bg-surface-1 p-5" style={{ animationDelay: "0.03s" }}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">AI Code Trend</h3>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => handlePeriod(opt.days)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                period === opt.days
                  ? "bg-accent text-white"
                  : "text-text-tertiary hover:text-text-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              className="text-text-tertiary"
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => `${v}%`}
              className="text-text-tertiary"
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface-2, #1e1e2e)",
                border: "1px solid var(--color-border, #333)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v) => [`${v}%`]}
            />
            <Area
              type="monotone"
              dataKey="ratio"
              stroke="#2563eb"
              fill="#2563eb"
              fillOpacity={0.1}
              strokeWidth={2}
              name="AI Ratio"
            />
            <Area
              type="monotone"
              dataKey="influence"
              stroke="#f97316"
              fill="transparent"
              strokeWidth={2}
              strokeDasharray="6 3"
              name="AI Influence"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
