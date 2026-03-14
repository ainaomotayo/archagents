"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Props {
  gaps: Record<string, number>;
}

export function AIComplianceGaps({ gaps }: Props) {
  const data = Object.entries(gaps)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  if (data.length === 0) {
    return (
      <div className="animate-fade-up rounded-xl border border-border bg-surface-1 p-5" style={{ animationDelay: "0.03s" }}>
        <h3 className="text-sm font-semibold text-text-primary">Compliance Gaps</h3>
        <p className="mt-4 text-[13px] text-text-tertiary">No gaps detected.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-up rounded-xl border border-border bg-surface-1 p-5" style={{ animationDelay: "0.03s" }}>
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Compliance Gaps</h3>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} className="text-text-tertiary" />
            <YAxis
              type="category"
              dataKey="category"
              tick={{ fontSize: 11 }}
              width={120}
              className="text-text-secondary"
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface-2, #1e1e2e)",
                border: "1px solid var(--color-border, #333)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
