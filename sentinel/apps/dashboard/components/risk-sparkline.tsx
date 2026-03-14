"use client";

import { useId } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import type { RiskTrendPoint } from "@/lib/types";

interface RiskSparklineProps {
  points: RiskTrendPoint[];
  direction: "up" | "down" | "flat";
  width?: number;
  height?: number;
}

const COLORS = {
  down: "#22c55e",  // green — risk decreasing is good
  up: "#ef4444",    // red — risk increasing is bad
  flat: "#6b7280",  // gray — neutral
} as const;

export function RiskSparkline({
  points,
  direction,
  width = 120,
  height = 40,
}: RiskSparklineProps) {
  if (points.length === 0) {
    return (
      <div
        data-direction={direction}
        className="flex items-center justify-center text-[10px] text-text-tertiary"
        style={{ width, height }}
      >
        No data
      </div>
    );
  }

  const color = COLORS[direction];
  const gradId = useId();

  return (
    <div data-direction={direction} style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
          <Area
            type="monotone"
            dataKey="score"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
