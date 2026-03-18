"use client";

import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { ComplianceTrendPoint } from "@/lib/types";

interface TrendSparklineProps {
  data: ComplianceTrendPoint[];
}

export function TrendSparkline({ data }: TrendSparklineProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[80px] items-center justify-center text-[11px] text-text-tertiary">
        No trend data
      </div>
    );
  }

  const chartData = data.map((d) => ({
    date: d.date,
    score: Math.round(d.score * 100),
  }));

  return (
    <div className="h-[80px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" hide />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface-1)",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              fontSize: "11px",
            }}
            formatter={(value) => [`${value ?? 0}%`, "Score"]}
            labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#6366f1"
            strokeWidth={1.5}
            fill="url(#sparkGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
