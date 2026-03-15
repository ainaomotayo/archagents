import type { ComplianceVerdict } from "./types";

const VERDICT_STYLES: Record<ComplianceVerdict, string> = {
  compliant: "bg-status-pass/15 text-status-pass border-status-pass/30",
  partially_compliant: "bg-amber-400/15 text-amber-500 border-amber-400/30",
  needs_remediation: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  non_compliant: "bg-status-fail/15 text-status-fail border-status-fail/30",
};

const VERDICT_LABELS: Record<ComplianceVerdict, string> = {
  compliant: "Compliant",
  partially_compliant: "Partial",
  needs_remediation: "Remediation",
  non_compliant: "Non-compliant",
};

export function VerdictBadge({ verdict }: { verdict: ComplianceVerdict }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${VERDICT_STYLES[verdict]}`}
    >
      {VERDICT_LABELS[verdict]}
    </span>
  );
}
