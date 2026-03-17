"use client";

import type { WizardProgress } from "@/lib/wizard-types";

interface ProgressSummaryProps {
  progress: WizardProgress;
}

const PHASE_LABELS: Record<number, string> = {
  1: "Foundation",
  2: "Core Requirements",
  3: "Conformity",
  4: "Post-Market",
};

export function ProgressSummary({ progress }: ProgressSummaryProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-text-primary">Overall Progress</span>
        <span className="text-text-secondary">{Math.round(progress.overall * 100)}%</span>
      </div>
      <div className="h-2 rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${Math.round(progress.overall * 100)}%` }}
        />
      </div>

      <div className="space-y-2 pt-1">
        {Object.entries(progress.phaseProgress).map(([phase, data]) => (
          <div key={phase} className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-tertiary">{PHASE_LABELS[Number(phase)]}</span>
              <span className="text-text-tertiary">{data.completed}/{data.total}</span>
            </div>
            <div className="h-1 rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent/60 transition-all"
                style={{ width: data.total > 0 ? `${(data.completed / data.total) * 100}%` : "0%" }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 pt-2 text-[11px] text-text-tertiary">
        <span>{progress.completedSteps} completed</span>
        {progress.skippedSteps > 0 && <span>{progress.skippedSteps} skipped</span>}
        <span>{progress.totalSteps} total</span>
      </div>
    </div>
  );
}
