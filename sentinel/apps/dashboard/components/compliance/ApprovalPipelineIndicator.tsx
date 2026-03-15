import type { AttestationApproval } from "./attestation-types";

interface ApprovalPipelineIndicatorProps {
  approvals: AttestationApproval[];
  compact?: boolean;
}

function StageIcon({ decision }: { decision: string }) {
  if (decision === "approved") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-status-pass/20 text-status-pass">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }
  if (decision === "rejected") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-status-fail/20 text-status-fail">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </span>
    );
  }
  if (decision === "changes_requested") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/20 text-amber-500">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface-2">
      <span className="h-2 w-2 rounded-full bg-text-tertiary" />
    </span>
  );
}

export function ApprovalPipelineIndicator({ approvals, compact }: ApprovalPipelineIndicatorProps) {
  const reviewApproval = approvals.find((a) => a.stage === "review");
  const finalApproval = approvals.find((a) => a.stage === "final_approval");

  const stages = [
    { label: "Review", decision: reviewApproval?.decision ?? "pending" },
    { label: "Final Approval", decision: finalApproval?.decision ?? "pending" },
  ];

  return (
    <div className="flex items-center gap-1.5">
      {stages.map((stage, i) => (
        <div key={stage.label} className="flex items-center gap-1.5">
          <StageIcon decision={stage.decision} />
          {!compact && (
            <span className="text-[11px] text-text-tertiary">{stage.label}</span>
          )}
          {i < stages.length - 1 && (
            <div className="h-px w-3 bg-border" />
          )}
        </div>
      ))}
    </div>
  );
}
