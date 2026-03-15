"use client";

import { useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { AgingDataPoint } from "@/lib/types";

interface AgingChartProps {
  initialData: AgingDataPoint[];
  onRefresh: (scope: string, scopeValue: string) => Promise<AgingDataPoint[]>;
}

const SCOPES = [
  { label: "All", value: "" },
  { label: "Framework", value: "framework" },
  { label: "Team", value: "team" },
];

export function AgingChart({ initialData, onRefresh }: AgingChartProps) {
  const [data, setData] = useState(initialData);
  const [scope, setScope] = useState("");
  const [scopeValue, setScopeValue] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(
    async (newScope: string, newScopeValue: string) => {
      setLoading(true);
      try {
        const result = await onRefresh(newScope, newScopeValue);
        setData(result);
      } catch {
        // keep existing data
      } finally {
        setLoading(false);
      }
    },
    [onRefresh],
  );

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-text-primary">Aging Distribution</h3>
        <div className="flex items-center gap-2">
          <select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              refresh(e.target.value, scopeValue);
            }}
            className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-[11px] text-text-primary focus:border-accent focus:outline-none"
          >
            {SCOPES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {scope && (
            <input
              type="text"
              placeholder="e.g. soc2"
              value={scopeValue}
              onChange={(e) => setScopeValue(e.target.value)}
              onBlur={() => refresh(scope, scopeValue)}
              className="w-24 rounded-lg border border-border bg-surface-2 px-2 py-1 text-[11px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
            />
          )}
        </div>
      </div>
      <div className={`h-64 ${loading ? "opacity-50" : ""}`}>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #333)" />
              <XAxis
                dataKey="bucket"
                tick={{ fontSize: 10, fill: "var(--color-text-tertiary, #888)" }}
              />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-text-tertiary, #888)" }} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface-2, #1a1a1a)",
                  border: "1px solid var(--color-border, #333)",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Bar dataKey="critical" stackId="a" fill="#ef4444" name="Critical" />
              <Bar dataKey="high" stackId="a" fill="#f97316" name="High" />
              <Bar dataKey="medium" stackId="a" fill="#f59e0b" name="Medium" />
              <Bar dataKey="low" stackId="a" fill="#6b7280" name="Low" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-[12px] text-text-tertiary">No data available</p>
          </div>
        )}
      </div>
    </div>
  );
}
