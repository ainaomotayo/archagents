import { forwardRef } from "react";
import type { ApprovalGate, ApprovalStatus } from "@/lib/types";

const STATUS_STYLES: Record<ApprovalStatus, { bg: string; text: string; dot: string; border: string }> = {
  pending: {
    bg: "bg-status-warn/15",
    text: "text-status-warn",
    dot: "bg-status-warn",
    border: "border-l-status-warn",
  },
  escalated: {
    bg: "bg-status-fail/15",
    text: "text-status-fail",
    dot: "bg-status-fail status-running",
    border: "border-l-status-fail",
  },
  approved: {
    bg: "bg-status-pass/15",
    text: "text-status-pass",
    dot: "bg-status-pass",
    border: "border-l-status-pass",
  },
  rejected: {
    bg: "bg-status-fail/15",
    text: "text-status-fail",
    dot: "bg-status-fail",
    border: "border-l-status-fail",
  },
  expired: {
    bg: "bg-surface-3",
    text: "text-text-tertiary",
    dot: "bg-text-tertiary",
    border: "border-l-text-tertiary",
  },
};

const GATE_TYPE_LABEL: Record<string, string> = {
  risk_threshold: "Risk Threshold",
  category_block: "Category Block",
  license_review: "License Review",
  always_review: "Always Review",
};

function formatTimeRemaining(expiresAt: string): { text: string; urgency: "ok" | "warn" | "critical" | "expired" } {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return { text: "Expired", urgency: "expired" };
  const hours = remaining / (1000 * 60 * 60);
  if (hours < 1) {
    const mins = Math.floor(remaining / (1000 * 60));
    return { text: `${mins}m left`, urgency: "critical" };
  }
  if (hours < 4) return { text: `${hours.toFixed(1)}h left`, urgency: "critical" };
  if (hours < 8) return { text: `${hours.toFixed(1)}h left`, urgency: "warn" };
  return { text: `${Math.floor(hours)}h left`, urgency: "ok" };
}

const URGENCY_COLORS = {
  ok: "text-status-pass",
  warn: "text-status-warn",
  critical: "text-status-fail",
  expired: "text-text-tertiary",
};

interface ApprovalCardProps {
  gate: ApprovalGate;
  selected: boolean;
  onClick: () => void;
}

export const ApprovalCard = forwardRef<HTMLButtonElement, ApprovalCardProps>(
  function ApprovalCard({ gate, selected, onClick }, ref) {
  const style = STATUS_STYLES[gate.status];
  const sla = formatTimeRemaining(gate.expiresAt);
  const isActionable = gate.status === "pending" || gate.status === "escalated";

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`w-full text-left rounded-lg border border-l-[3px] p-4 transition-all duration-150 ${
        selected
          ? `border-border-accent bg-accent-subtle/40 ${style.border}`
          : `border-border bg-surface-1 ${style.border} hover:border-border-accent hover:bg-surface-2`
      } ${!isActionable ? "opacity-60" : ""}`}
      aria-label={`Approval gate for ${gate.projectName}: ${gate.status}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${style.bg} ${style.text} border-current/30`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
          {gate.status}
        </span>
        <div className="flex items-center gap-2">
          <span className="rounded bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-text-secondary">
            {GATE_TYPE_LABEL[gate.gateType] ?? gate.gateType}
          </span>
          {isActionable && (
            <span className={`text-[11px] font-mono font-medium ${URGENCY_COLORS[sla.urgency]}`}>
              {sla.text}
            </span>
          )}
        </div>
      </div>

      <p className="mt-2 truncate text-sm font-semibold text-text-primary">
        {gate.projectName}
        <span className="font-normal text-text-tertiary"> / {gate.scan.branch}</span>
      </p>

      <div className="mt-2 flex items-center gap-3 text-[11px] text-text-tertiary">
        <span>Risk: {gate.scan.riskScore}</span>
        <span>{gate.scan.findingCount} findings</span>
        <span className="font-mono">{gate.scan.commitHash.slice(0, 7)}</span>
        {gate.assignedRole && (
          <span className="ml-auto capitalize">{gate.assignedRole}</span>
        )}
      </div>
    </button>
  );
});

export { formatTimeRemaining, GATE_TYPE_LABEL, STATUS_STYLES };
