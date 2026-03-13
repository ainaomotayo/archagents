import type { RemediationStats } from "@/lib/types";

interface RemediationStatsBarProps {
  stats: RemediationStats;
}

const STAT_ITEMS: Array<{
  key: keyof RemediationStats;
  label: string;
  dotColor: string;
  format?: (v: number) => string;
}> = [
  { key: "open", label: "Open", dotColor: "bg-status-warn" },
  { key: "inProgress", label: "In Progress", dotColor: "bg-status-info" },
  { key: "overdue", label: "Overdue", dotColor: "bg-status-fail" },
  { key: "completed", label: "Completed", dotColor: "bg-status-pass" },
  { key: "acceptedRisk", label: "Accepted Risk", dotColor: "bg-text-tertiary" },
  { key: "avgResolutionDays", label: "Avg Resolution", dotColor: "bg-accent", format: (v) => `${v}d` },
  { key: "slaCompliance", label: "SLA Compliance", dotColor: "bg-status-pass", format: (v) => `${v}%` },
];

export function RemediationStatsBar({ stats }: RemediationStatsBarProps) {
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
          <span className={`font-mono text-[13px] font-bold ${key === "overdue" && stats[key] > 0 ? "text-status-fail" : "text-text-primary"}`}>
            {format ? format(stats[key]) : stats[key]}
          </span>
        </div>
      ))}
    </div>
  );
}
