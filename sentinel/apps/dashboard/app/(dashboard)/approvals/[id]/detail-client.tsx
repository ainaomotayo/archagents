"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ApprovalGate } from "@/lib/types";
import { ApprovalDetailPanel } from "@/components/approvals/approval-detail-panel";
import { submitDecision } from "@/app/(dashboard)/approvals/actions";

interface ApprovalDetailClientProps {
  gate: ApprovalGate;
}

export function ApprovalDetailClient({ gate: initialGate }: ApprovalDetailClientProps) {
  const [gate, setGate] = useState(initialGate);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleDecision = useCallback(
    async (gateId: string, decision: "approve" | "reject", justification: string) => {
      setIsSubmitting(true);

      // Optimistic update
      setGate((prev) => ({
        ...prev,
        status: decision === "approve" ? "approved" as const : "rejected" as const,
        decidedAt: new Date().toISOString(),
        decisions: [
          ...prev.decisions,
          {
            id: `local-${Date.now()}`,
            decidedBy: "you",
            decision,
            justification,
            decidedAt: new Date().toISOString(),
          },
        ],
      }));

      try {
        await submitDecision(gateId, decision, justification);
        router.refresh();
      } catch (err) {
        setGate(initialGate);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [initialGate, router],
  );

  return (
    <ApprovalDetailPanel
      gate={gate}
      onDecision={handleDecision}
      isSubmitting={isSubmitting}
    />
  );
}
