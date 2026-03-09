import type { Finding } from "@/lib/types";
import { SeverityBadge } from "./severity-badge";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  suppressed: "Suppressed",
  resolved: "Resolved",
};

interface FindingCardProps {
  finding: Finding;
}

export function FindingCard({ finding }: FindingCardProps) {
  return (
    <article
      className="rounded-lg border border-slate-800 bg-slate-900 p-5"
      aria-label={`Finding: ${finding.title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-white">
            {finding.title}
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            {finding.filePath}:{finding.lineStart}
          </p>
        </div>
        <SeverityBadge severity={finding.severity} />
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-slate-300">
        {finding.description}
      </p>

      <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
        <span className="capitalize">{finding.category}</span>
        <span aria-hidden="true">|</span>
        <span>{STATUS_LABEL[finding.status] ?? finding.status}</span>
        <span aria-hidden="true">|</span>
        <span>Confidence: {finding.confidence}%</span>
      </div>
    </article>
  );
}
