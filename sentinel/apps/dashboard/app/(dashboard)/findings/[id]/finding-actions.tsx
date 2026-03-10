"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { suppressFinding, resolveFinding, unsuppressFinding } from "./actions";

interface FindingActionsProps {
  findingId: string;
  status: string;
}

export function FindingActions({ findingId, status }: FindingActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionDone, setActionDone] = useState<string | null>(null);

  const isSuppressed = status === "suppressed";
  const isResolved = status === "resolved";

  const handleSuppress = () => {
    startTransition(async () => {
      try {
        if (isSuppressed) {
          await unsuppressFinding(findingId);
          setActionDone("unsuppressed");
        } else {
          await suppressFinding(findingId);
          setActionDone("suppressed");
        }
        setTimeout(() => router.push("/findings"), 1500);
      } catch {
        setActionDone("error");
      }
    });
  };

  const handleResolve = () => {
    startTransition(async () => {
      try {
        await resolveFinding(findingId);
        setActionDone("resolved");
        setTimeout(() => router.push("/findings"), 1500);
      } catch {
        setActionDone("error");
      }
    });
  };

  if (actionDone && actionDone !== "error") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-status-pass/30 bg-status-pass/10 px-4 py-2.5">
        <span className="inline-block h-2 w-2 rounded-full bg-status-pass" />
        <span className="text-[13px] font-semibold text-status-pass">
          Finding {actionDone} successfully. Redirecting...
        </span>
      </div>
    );
  }

  if (actionDone === "error") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-status-fail/30 bg-status-fail/10 px-4 py-2.5">
        <span className="inline-block h-2 w-2 rounded-full bg-status-fail" />
        <span className="text-[13px] font-semibold text-status-fail">
          Action failed. Please try again.
        </span>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={handleSuppress}
        disabled={isPending || isResolved}
        className="rounded-lg border border-status-warn/30 bg-status-warn/10 px-4 py-2.5 text-[13px] font-semibold text-status-warn transition-all hover:bg-status-warn/20 active:scale-[0.98] focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label={isSuppressed ? "Unsuppress this finding" : "Suppress this finding"}
      >
        {isPending ? "Processing..." : isSuppressed ? "Unsuppress" : "Suppress"}
      </button>
      <button
        type="button"
        onClick={handleResolve}
        disabled={isPending || isResolved}
        className="rounded-lg border border-status-pass/30 bg-status-pass/10 px-4 py-2.5 text-[13px] font-semibold text-status-pass transition-all hover:bg-status-pass/20 active:scale-[0.98] focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Mark this finding as resolved"
      >
        {isPending ? "Processing..." : isResolved ? "Resolved" : "Resolve"}
      </button>
    </div>
  );
}
