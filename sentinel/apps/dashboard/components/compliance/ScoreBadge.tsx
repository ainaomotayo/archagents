import { scoreToColor } from "./types";

const BADGE_STYLES: Record<string, string> = {
  green: "bg-status-pass/15 text-status-pass border-status-pass/30",
  amber: "bg-amber-400/15 text-amber-500 border-amber-400/30",
  orange: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  red: "bg-status-fail/15 text-status-fail border-status-fail/30",
  gray: "bg-surface-2 text-text-tertiary border-border",
};

export function ScoreBadge({ score }: { score: number }) {
  const color = score < 0 ? "gray" : scoreToColor(score);
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-bold tabular-nums ${BADGE_STYLES[color]}`}
    >
      {score < 0 ? "N/A" : `${Math.round(score * 100)}%`}
    </span>
  );
}
