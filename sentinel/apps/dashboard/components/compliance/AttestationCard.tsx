import Link from "next/link";
import type { Attestation } from "./attestation-types";
import { AttestationStatusBadge } from "./AttestationStatusBadge";
import { ApprovalPipelineIndicator } from "./ApprovalPipelineIndicator";

interface AttestationCardProps {
  attestation: Attestation;
  index: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AttestationCard({ attestation, index }: AttestationCardProps) {
  const a = attestation;

  return (
    <div
      className="animate-fade-up group rounded-xl border border-border bg-surface-1 p-5 transition-all duration-150 hover:border-border-accent hover:bg-surface-2"
      style={{ animationDelay: `${0.04 * index}s` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-accent">
              {a.controlCode}
            </span>
            <span className="text-[11px] text-text-tertiary">
              {a.frameworkSlug.toUpperCase()}
            </span>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-tertiary">
              {a.type === "manual" ? "Manual" : "Scan Approval"}
            </span>
          </div>
          <h3 className="mt-1 text-[14px] font-semibold text-text-primary group-hover:text-accent transition-colors">
            {a.title}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-text-tertiary">
            <span>Score: {Math.round(a.score * 100)}%</span>
            <span>Expires: {formatDate(a.expiresAt)}</span>
            <span>By: {a.createdBy}</span>
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-2">
          <AttestationStatusBadge status={a.status} />
          <ApprovalPipelineIndicator approvals={a.approvals} compact />
          <Link
            href={`/compliance/attestations/${a.id}`}
            className="text-[12px] font-medium text-accent hover:brightness-110 focus-ring rounded"
          >
            View
          </Link>
        </div>
      </div>
    </div>
  );
}
