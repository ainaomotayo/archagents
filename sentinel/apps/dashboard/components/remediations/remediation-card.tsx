import { forwardRef } from "react";
import type { RemediationItem } from "@/lib/types";

const PRIORITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  critical: {
    bg: "bg-status-fail/15",
    text: "text-status-fail",
    border: "border-l-status-fail",
  },
  high: {
    bg: "bg-severity-high/15",
    text: "text-severity-high",
    border: "border-l-severity-high",
  },
  medium: {
    bg: "bg-status-warn/15",
    text: "text-status-warn",
    border: "border-l-status-warn",
  },
  low: {
    bg: "bg-status-pass/15",
    text: "text-status-pass",
    border: "border-l-status-pass",
  },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  open: {
    bg: "bg-status-warn/15",
    text: "text-status-warn",
    dot: "bg-status-warn",
  },
  in_progress: {
    bg: "bg-status-info/15",
    text: "text-status-info",
    dot: "bg-status-info",
  },
  completed: {
    bg: "bg-status-pass/15",
    text: "text-status-pass",
    dot: "bg-status-pass",
  },
  accepted_risk: {
    bg: "bg-surface-3",
    text: "text-text-tertiary",
    dot: "bg-text-tertiary",
  },
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  completed: "Completed",
  accepted_risk: "Accepted Risk",
};

function isOverdue(item: RemediationItem): boolean {
  if (!item.dueDate || item.status === "completed" || item.status === "accepted_risk") return false;
  return new Date(item.dueDate) < new Date();
}

function formatDueDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  return `${diffDays}d left`;
}

interface RemediationCardProps {
  item: RemediationItem;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
}

export const RemediationCard = forwardRef<HTMLButtonElement, RemediationCardProps>(
  function RemediationCard({ item, selected, onClick, compact }, ref) {
    const priorityStyle = PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.medium;
    const statusStyle = STATUS_STYLES[item.status] ?? STATUS_STYLES.open;
    const overdue = isOverdue(item);
    const childCount = item.children?.length ?? 0;
    const completedChildren = item.children?.filter((c) => c.status === "completed").length ?? 0;

    return (
      <button
        ref={ref}
        onClick={onClick}
        className={`w-full text-left rounded-lg border border-l-[3px] p-4 transition-all duration-150 ${
          selected
            ? `border-border-accent bg-accent-subtle/40 ${priorityStyle.border}`
            : `border-border bg-surface-1 ${priorityStyle.border} hover:border-border-accent hover:bg-surface-2`
        }`}
        aria-label={`Remediation: ${item.title}, ${item.priority} priority, ${STATUS_LABELS[item.status] ?? item.status}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${statusStyle.bg} ${statusStyle.text} border-current/30`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
            {STATUS_LABELS[item.status] ?? item.status}
          </span>
          <div className="flex items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${priorityStyle.bg} ${priorityStyle.text}`}>
              {item.priority}
            </span>
            {item.priorityScore > 0 && (
              <span className="font-mono text-[10px] text-text-tertiary">
                {item.priorityScore}
              </span>
            )}
          </div>
        </div>

        <p className="mt-2 truncate text-sm font-semibold text-text-primary">
          {item.title}
        </p>

        {!compact && (
          <div className="mt-2 flex items-center gap-3 text-[11px] text-text-tertiary">
            {item.itemType && (
              <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary capitalize">
                {item.itemType}
              </span>
            )}
            {item.frameworkSlug && (
              <span className="uppercase font-mono">{item.frameworkSlug}</span>
            )}
            {item.controlCode && (
              <span className="font-mono">{item.controlCode}</span>
            )}
            {item.assignedTo && (
              <span className="ml-auto truncate max-w-[100px]">{item.assignedTo}</span>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center gap-3 text-[11px] text-text-tertiary">
          {item.dueDate && (
            <span className={overdue ? "font-semibold text-status-fail" : ""}>
              {formatDueDate(item.dueDate)}
            </span>
          )}
          {childCount > 0 && (
            <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
              {completedChildren}/{childCount} done
            </span>
          )}
          {item.externalRef && (
            <span className="ml-auto font-mono text-[10px] text-accent truncate max-w-[120px]">
              {item.externalRef}
            </span>
          )}
        </div>
      </button>
    );
  },
);

export { PRIORITY_STYLES, STATUS_STYLES, STATUS_LABELS, isOverdue, formatDueDate };
