"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { AIProjectComparison, AIProjectMetric } from "@/lib/types";

const LINE_COLORS = ["#2563eb", "#f97316", "#8b5cf6", "#22c55e", "#ec4899"];

interface Props {
  comparison: AIProjectComparison | null;
  projects: AIProjectMetric[];
  onClose: () => void;
}

export function AIProjectCompare({ comparison, projects, onClose }: Props) {
  if (!comparison) return null;

  // Build merged data keyed by date
  const dateMap = new Map<string, Record<string, number>>();

  for (const projectId of comparison.projectIds) {
    const series = comparison.series[projectId] ?? [];
    for (const pt of series) {
      if (!dateMap.has(pt.date)) dateMap.set(pt.date, {});
      dateMap.get(pt.date)![projectId] = +(pt.aiRatio * 100).toFixed(1);
    }
  }

  const data = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...values }));

  const projectMap = new Map(projects.map((p) => [p.projectId, p.projectName]));

  return (
    <div className="animate-fade-up rounded-xl border border-border bg-surface-1 p-5" style={{ animationDelay: "0.03s" }}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">
          Project Comparison
        </h3>
        <button
          onClick={onClose}
          className="rounded-md px-2.5 py-1 text-[11px] font-medium text-text-tertiary hover:text-text-primary transition-colors"
        >
          Close
        </button>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-text-tertiary" />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v}%`} className="text-text-tertiary" />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface-2, #1e1e2e)",
                border: "1px solid var(--color-border, #333)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v) => [`${v}%`]}
            />
            <Legend />
            {comparison.projectIds.map((id, i) => (
              <Line
                key={id}
                type="monotone"
                dataKey={id}
                name={projectMap.get(id) ?? id}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
