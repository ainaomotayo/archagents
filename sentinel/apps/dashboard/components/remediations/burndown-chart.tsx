"use client";

import { useState, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { BurndownDataPoint } from "@/lib/types";

interface BurndownChartProps {
  initialData: BurndownDataPoint[];
  onRefresh: (scope: string, scopeValue: string, days: number) => Promise<BurndownDataPoint[]>;
}

const DATE_PRESETS = [
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
  { label: "90d", days: 90 },
];

const SCOPES = [
  { label: "All", value: "" },
  { label: "Framework", value: "framework" },
  { label: "Team", value: "team" },
];

export function BurndownChart({ initialData, onRefresh }: BurndownChartProps) {
  const [data, setData] = useState(initialData);
  const [days, setDays] = useState(30);
  const [scope, setScope] = useState("");
  const [scopeValue, setScopeValue] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(
    async (newDays: number, newScope: string, newScopeValue: string) => {
      setLoading(true);
      try {
        const result = await onRefresh(newScope, newScopeValue, newDays);
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
        <h3 className="text-[14px] font-semibold text-text-primary">Burndown</h3>
        <div className="flex items-center gap-2">
          <select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              refresh(days, e.target.value, scopeValue);
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
              onBlur={() => refresh(days, scope, scopeValue)}
              className="w-24 rounded-lg border border-border bg-surface-2 px-2 py-1 text-[11px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
            />
          )}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => {
                  setDays(p.days);
                  refresh(p.days, scope, scopeValue);
                }}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  days === p.days
                    ? "bg-accent text-white"
                    : "bg-surface-2 text-text-secondary hover:bg-surface-3"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={`h-64 ${loading ? "opacity-50" : ""}`}>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #333)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "var(--color-text-tertiary, #888)" }}
                tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
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
              <Area
                type="monotone"
                dataKey="open"
                stackId="1"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.3}
                name="Open"
              />
              <Area
                type="monotone"
                dataKey="inProgress"
                stackId="1"
                stroke="#f59e0b"
                fill="#f59e0b"
                fillOpacity={0.3}
                name="In Progress"
              />
            </AreaChart>
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
