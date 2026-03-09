import type { CertificateStatus } from "@/lib/types";

const STATUS_STYLES: Record<CertificateStatus, string> = {
  active: "bg-green-900/50 text-green-300 border-green-700",
  revoked: "bg-red-900/50 text-red-300 border-red-700",
  expired: "bg-slate-800 text-slate-400 border-slate-600",
};

interface CertificateBadgeProps {
  status: CertificateStatus;
}

export function CertificateBadge({ status }: CertificateBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status]}`}
      aria-label={`Certificate status: ${status}`}
    >
      {status}
    </span>
  );
}
