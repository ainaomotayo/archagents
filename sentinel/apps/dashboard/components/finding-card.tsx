import type { Finding } from "@/lib/types";
import { SeverityBadge } from "./severity-badge";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  suppressed: "Suppressed",
  resolved: "Resolved",
};

const STATUS_DOT: Record<string, string> = {
  open: "bg-status-warn",
  suppressed: "bg-text-tertiary",
  resolved: "bg-status-pass",
};

interface FindingCardProps {
  finding: Finding;
}

export function FindingCard({ finding }: FindingCardProps) {
  return (
    <article
      className="group rounded-lg border border-border bg-surface-1 p-5 transition-all duration-150 hover:border-border-accent hover:bg-surface-2"
      aria-label={`Finding: ${finding.title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
            {finding.title}
          </h3>
          <p className="mt-1 font-mono text-[11px] text-text-tertiary">
            {finding.filePath}:{finding.lineStart}
          </p>
        </div>
        <SeverityBadge severity={finding.severity} />
      </div>

      <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-text-secondary">
        {finding.description}
      </p>

      <div className="mt-4 flex items-center gap-3 text-[11px] text-text-tertiary">
        <span className="rounded bg-surface-3 px-2 py-0.5 font-medium capitalize">
          {finding.category.replace(/-/g, " ")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[finding.status] ?? "bg-text-tertiary"}`} />
          {STATUS_LABEL[finding.status] ?? finding.status}
        </span>
        <span className="ml-auto font-mono">
          {finding.confidence}% confidence
        </span>
      </div>
    </article>
  );
}
