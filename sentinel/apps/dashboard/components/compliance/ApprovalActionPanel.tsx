"use client";

import { useState } from "react";
import type { Attestation } from "./attestation-types";
import { canUserAct } from "./attestation-types";

interface ApprovalActionPanelProps {
  attestation: Attestation;
  currentUser: string;
  currentRole: string;
  onReview: (decision: string, comment?: string) => Promise<void>;
  onFinalApprove: (decision: string, comment?: string) => Promise<void>;
}

export function ApprovalActionPanel({
  attestation,
  currentUser,
  currentRole,
  onReview,
  onFinalApprove,
}: ApprovalActionPanelProps) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reviewApproval = attestation.approvals.find((a) => a.stage === "review");
  const reviewedBy = reviewApproval?.decidedBy ?? null;

  const isPendingReview = attestation.status === "pending_review";
  const isPendingApproval = attestation.status === "pending_approval";

  const canReview =
    isPendingReview &&
    canUserAct(currentRole, attestation.createdBy, reviewedBy, "review_approve", currentUser);

  const canFinalApprove =
    isPendingApproval &&
    canUserAct(currentRole, attestation.createdBy, reviewedBy, "final_approve", currentUser);

  if (!canReview && !canFinalApprove) {
    if (isPendingReview || isPendingApproval) {
      return (
        <div className="rounded-lg border border-border bg-surface-1 p-4">
          <p className="text-[12px] text-text-tertiary text-center">
            {attestation.createdBy === currentUser
              ? "You cannot review your own attestation"
              : "You don't have permission to act on this attestation"}
          </p>
        </div>
      );
    }
    return null;
  }

  const handleAction = async (decision: string) => {
    setSubmitting(true);
    try {
      if (canReview) {
        await onReview(decision, comment || undefined);
      } else {
        await onFinalApprove(decision, comment || undefined);
      }
      setComment("");
    } finally {
      setSubmitting(false);
    }
  };

  const stage = canReview ? "Review" : "Final Approval";

  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4 space-y-3">
      <p className="text-[12px] font-semibold text-text-secondary">
        {stage} Action
      </p>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment (optional)..."
        rows={2}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px] text-text-primary placeholder:text-text-tertiary focus-ring resize-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleAction("approved")}
          disabled={submitting}
          className="rounded-lg bg-status-pass/20 px-3 py-1.5 text-[12px] font-semibold text-status-pass hover:bg-status-pass/30 transition-colors disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => handleAction("changes_requested")}
          disabled={submitting}
          className="rounded-lg bg-amber-400/20 px-3 py-1.5 text-[12px] font-semibold text-amber-500 hover:bg-amber-400/30 transition-colors disabled:opacity-50"
        >
          Request Changes
        </button>
        <button
          type="button"
          onClick={() => handleAction("rejected")}
          disabled={submitting}
          className="rounded-lg bg-status-fail/20 px-3 py-1.5 text-[12px] font-semibold text-status-fail hover:bg-status-fail/30 transition-colors disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
