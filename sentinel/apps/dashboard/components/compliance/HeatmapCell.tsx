"use client";

import { scoreToColor } from "./types";

interface HeatmapCellProps {
  score: number;
  total: number;
  passing: number;
  failing: number;
  controlCode: string;
  controlName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isSelected: boolean;
  isFocused: boolean;
  isAttested?: boolean;
  attestedExpiresAt?: string;
  onClick: () => void;
}

const COLOR_MAP: Record<string, string> = {
  green: "#22c55e",
  amber: "#f59e0b",
  orange: "#f97316",
  red: "#ef4444",
  gray: "#6b7280",
};

export function HeatmapCell({
  score,
  total,
  passing,
  failing,
  controlCode,
  controlName,
  x,
  y,
  width,
  height,
  isSelected,
  isFocused,
  isAttested,
  attestedExpiresAt,
  onClick,
}: HeatmapCellProps) {
  const color = score < 0 ? "gray" : scoreToColor(score);
  const fill = COLOR_MAP[color];
  const lowConfidence = total < 5;
  const patternId = `stripe-${controlCode}`;

  return (
    <g onClick={onClick} className="cursor-pointer" role="button" tabIndex={0}>
      {lowConfidence && (
        <defs>
          <pattern
            id={patternId}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill={fill} opacity={0.6} />
            <line
              x1="0" y1="0" x2="0" y2="6"
              stroke="white"
              strokeWidth="2"
              opacity="0.3"
            />
          </pattern>
        </defs>
      )}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={3}
        fill={lowConfidence ? `url(#${patternId})` : fill}
        opacity={0.85}
        stroke={isSelected ? "white" : "transparent"}
        strokeWidth={isSelected ? 2 : 0}
      />
      {isFocused && (
        <rect
          x={x - 1}
          y={y - 1}
          width={width + 2}
          height={height + 2}
          rx={4}
          fill="none"
          stroke="#6366f1"
          strokeWidth={2}
          strokeDasharray="4 2"
        />
      )}
      {isAttested && (
        <g transform={`translate(${x + width - 12}, ${y + 2})`}>
          <path
            d="M5 0L10 2.5V6.5C10 9.5 5 11 5 11S0 9.5 0 6.5V2.5L5 0Z"
            fill="#6366f1"
            opacity={0.9}
          />
          <path d="M3 5.5L4.5 7L7 4.5" stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      <title>{`${controlCode}: ${controlName} — ${score < 0 ? "N/A" : `${Math.round(score * 100)}%`}${score >= 0 ? ` (${passing} passing, ${failing} failing)` : ""}${isAttested ? ` (Attested${attestedExpiresAt ? `, expires ${new Date(attestedExpiresAt).toLocaleDateString()}` : ""})` : ""}`}</title>
    </g>
  );
}
