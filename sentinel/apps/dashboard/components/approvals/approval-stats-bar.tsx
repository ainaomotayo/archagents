import type { ApprovalStats } from "@/lib/types";

interface ApprovalStatsBarProps {
  stats: ApprovalStats;
}

const STAT_ITEMS: Array<{
  key: keyof ApprovalStats;
  label: string;
  dotColor: string;
  format?: (v: number) => string;
}> = [
  { key: "pending", label: "Pending", dotColor: "bg-status-warn" },
  { key: "escalated", label: "Escalated", dotColor: "bg-status-fail" },
  { key: "decidedToday", label: "Decided today", dotColor: "bg-status-pass" },
  { key: "avgDecisionTimeHours", label: "Avg time", dotColor: "bg-status-info", format: (v) => `${v.toFixed(1)}h` },
  { key: "expiringSoon", label: "Expiring soon", dotColor: "bg-severity-high" },
];

export function ApprovalStatsBar({ stats }: ApprovalStatsBarProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {STAT_ITEMS.map(({ key, label, dotColor, format }) => (
        <div
          key={key}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2"
        >
          <span className={`h-2 w-2 rounded-full ${dotColor}`} />
          <span className="text-[11px] font-semibold text-text-secondary">
            {label}
          </span>
          <span className="font-mono text-[13px] font-bold text-text-primary">
            {format ? format(stats[key]) : stats[key]}
          </span>
        </div>
      ))}
    </div>
  );
}
