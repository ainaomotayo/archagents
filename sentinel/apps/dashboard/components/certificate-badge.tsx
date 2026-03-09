import type { CertificateStatus } from "@/lib/types";

const STATUS_STYLES: Record<CertificateStatus, string> = {
  active: "bg-status-pass/15 text-status-pass border-status-pass/30",
  revoked: "bg-status-fail/15 text-status-fail border-status-fail/30",
  expired: "bg-surface-3 text-text-tertiary border-border",
};

const STATUS_DOT: Record<CertificateStatus, string> = {
  active: "bg-status-pass",
  revoked: "bg-status-fail",
  expired: "bg-text-tertiary",
};

interface CertificateBadgeProps {
  status: CertificateStatus;
}

export function CertificateBadge({ status }: CertificateBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${STATUS_STYLES[status]}`}
      aria-label={`Certificate status: ${status}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {status}
    </span>
  );
}
