"use client";

import type { WizardStep } from "@/lib/wizard-types";
import { EU_AI_ACT_CONTROLS } from "@/lib/wizard-types";

interface StepHeaderProps {
  step: WizardStep;
}

const STATE_LABELS: Record<WizardStep["state"], { label: string; className: string }> = {
  locked: { label: "Locked", className: "bg-zinc-500/10 text-zinc-400" },
  available: { label: "Available", className: "bg-blue-500/10 text-blue-400" },
  in_progress: { label: "In Progress", className: "bg-amber-500/10 text-amber-400" },
  completed: { label: "Completed", className: "bg-emerald-500/10 text-emerald-400" },
  skipped: { label: "Skipped", className: "bg-zinc-500/10 text-zinc-400" },
};

export function StepHeader({ step }: StepHeaderProps) {
  const control = EU_AI_ACT_CONTROLS.find((c) => c.code === step.controlCode);
  const stateInfo = STATE_LABELS[step.state];

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <span className="text-xs font-mono text-text-tertiary">{step.controlCode}</span>
        <span className="text-xs text-text-tertiary">
          {control?.article}
        </span>
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${stateInfo.className}`}>
          {stateInfo.label}
        </span>
      </div>
      <h2 className="text-lg font-semibold text-text-primary">
        {control?.title ?? step.controlCode}
      </h2>
      {step.completedAt && (
        <p className="mt-1 text-xs text-text-tertiary">
          Completed on {new Date(step.completedAt).toLocaleDateString()}
        </p>
      )}
      {step.skipReason && (
        <p className="mt-1 text-xs text-text-tertiary">
          Skipped: {step.skipReason}
        </p>
      )}
    </div>
  );
}
