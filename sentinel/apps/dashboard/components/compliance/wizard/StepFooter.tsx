"use client";

import { useState } from "react";
import type { WizardStep } from "@/lib/wizard-types";

interface StepFooterProps {
  step: WizardStep;
  onComplete: () => void;
  onSkip: (reason: string) => void;
  onSave: () => void;
  canComplete: boolean;
}

export function StepFooter({ step, onComplete, onSkip, onSave, canComplete }: StepFooterProps) {
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [skipReason, setSkipReason] = useState("");

  const isEditable = step.state === "available" || step.state === "in_progress";
  const isDone = step.state === "completed" || step.state === "skipped";

  if (isDone) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-2/50 px-4 py-3">
        <svg className="h-4 w-4 text-text-tertiary" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <span className="text-sm text-text-secondary">
          This step has been {step.state === "completed" ? "completed" : "skipped"} and is read-only.
        </span>
      </div>
    );
  }

  if (!isEditable) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 border-t border-border-subtle pt-4">
        <button
          onClick={onSave}
          className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-2/80 transition-colors"
        >
          Save Progress
        </button>
        <button
          onClick={onComplete}
          disabled={!canComplete}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={!canComplete ? "Complete all required items first" : undefined}
        >
          Mark Complete
        </button>
        <button
          onClick={() => setShowSkipDialog(true)}
          className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-text-tertiary hover:text-text-secondary transition-colors"
        >
          Skip Step
        </button>
      </div>

      {showSkipDialog && (
        <div className="rounded-lg border border-border bg-surface-2 p-4 space-y-3">
          <p className="text-sm text-text-primary font-medium">Why are you skipping this step?</p>
          <textarea
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            placeholder="e.g. Not applicable for our deployment model"
            rows={2}
            className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (skipReason.trim()) {
                  onSkip(skipReason.trim());
                  setShowSkipDialog(false);
                  setSkipReason("");
                }
              }}
              disabled={!skipReason.trim()}
              className="rounded-lg bg-zinc-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-500 transition-colors disabled:opacity-50"
            >
              Confirm Skip
            </button>
            <button
              onClick={() => { setShowSkipDialog(false); setSkipReason(""); }}
              className="text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
