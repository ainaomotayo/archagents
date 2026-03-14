"use client";

import { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { AIToolBreakdownEntry } from "@/lib/types";

// ── Exports for testing ────────────────────────────────

export const TOOL_COLORS: Record<string, string> = {
  copilot: "#2563eb",
  claude: "#f97316",
  cursor: "#8b5cf6",
  chatgpt: "#22c55e",
  codewhisperer: "#ec4899",
  devin: "#06b6d4",
  unknown: "#6b7280",
};

export function getToolColor(tool: string): string {
  return TOOL_COLORS[tool.toLowerCase()] ?? TOOL_COLORS.unknown;
}

export const PERIOD_PRESETS = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "6m", days: 180 },
  { label: "1y", days: 365 },
] as const;

// ── Component ──────────────────────────────────────────

interface Props {
  breakdown: AIToolBreakdownEntry[];
  onPeriodChange?: (days: number) => void;
  activePeriod?: number;
}

export function AIToolBreakdownChart({
  breakdown,
  onPeriodChange,
  activePeriod = 30,
}: Props) {
  const [period, setPeriod] = useState(activePeriod);
  const [includeEstimated, setIncludeEstimated] = useState(true);

  function handlePeriod(days: number) {
    setPeriod(days);
    onPeriodChange?.(days);
  }

  const data = breakdown.map((entry) => ({
    name: entry.tool,
    value: includeEstimated
      ? entry.confirmedFiles + entry.estimatedFiles
      : entry.confirmedFiles,
    confirmed: entry.confirmedFiles,
    estimated: entry.estimatedFiles,
    percentage: entry.percentage,
  }));

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="animate-fade-up rounded-xl border border-border bg-surface-1 p-5" style={{ animationDelay: "0.03s" }}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Tool Breakdown</h3>
        <div className="flex gap-1">
          {PERIOD_PRESETS.map((opt) => (
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

      <div className="flex items-center gap-6">
        <div className="h-48 w-48 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={getToolColor(entry.name)} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface-2, #1e1e2e)",
                  border: "1px solid var(--color-border, #333)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex-1 space-y-2">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-[12px]">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: getToolColor(d.name) }}
              />
              <span className="font-medium text-text-primary capitalize">
                {d.name}
              </span>
              <span className="text-text-tertiary">
                {total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%
              </span>
              <span className="text-text-tertiary">
                ({d.confirmed}c + {d.estimated}e)
              </span>
            </div>
          ))}
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2 text-[11px] text-text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={includeEstimated}
          onChange={(e) => setIncludeEstimated(e.target.checked)}
          className="rounded border-border"
        />
        Include estimated
      </label>
    </div>
  );
}
