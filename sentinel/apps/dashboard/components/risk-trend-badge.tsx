interface RiskTrendBadgeProps {
  direction: "up" | "down" | "flat";
  changePercent: number;
}

const ARROWS: Record<string, string> = {
  up: "\u2191",    // ↑
  down: "\u2193",  // ↓
  flat: "\u2192",  // →
};

const COLORS: Record<string, string> = {
  down: "text-green-500",  // risk decreasing = good
  up: "text-red-500",      // risk increasing = bad
  flat: "text-text-tertiary",
};

export function RiskTrendBadge({ direction, changePercent }: RiskTrendBadgeProps) {
  const sign = changePercent > 0 ? "+" : "";
  return (
    <span
      data-direction={direction}
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${COLORS[direction]}`}
    >
      <span>{ARROWS[direction]}</span>
      <span>{sign}{changePercent}%</span>
    </span>
  );
}
