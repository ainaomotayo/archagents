import type { Severity } from "@/lib/types";

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: "bg-red-900/50 text-red-300 border-red-700",
  high: "bg-orange-900/50 text-orange-300 border-orange-700",
  medium: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
  low: "bg-blue-900/50 text-blue-300 border-blue-700",
};

interface SeverityBadgeProps {
  severity: Severity;
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${SEVERITY_STYLES[severity]}`}
      aria-label={`Severity: ${severity}`}
    >
      {severity}
    </span>
  );
}
