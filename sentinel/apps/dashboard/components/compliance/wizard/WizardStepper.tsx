"use client";

import type { WizardStep } from "@/lib/wizard-types";
import { EU_AI_ACT_CONTROLS } from "@/lib/wizard-types";

interface WizardStepperProps {
  steps: WizardStep[];
  currentCode: string;
  onSelectStep: (code: string) => void;
}

const PHASE_LABELS: Record<number, string> = {
  1: "Phase 1: Foundation",
  2: "Phase 2: Core Requirements",
  3: "Phase 3: Conformity",
  4: "Phase 4: Post-Market",
};

function StateIcon({ state }: { state: WizardStep["state"] }) {
  switch (state) {
    case "completed":
      return (
        <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      );
    case "skipped":
      return (
        <svg className="h-4 w-4 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      );
    case "in_progress":
      return (
        <div className="h-4 w-4 rounded-full border-2 border-accent bg-accent/20" />
      );
    case "available":
      return (
        <div className="h-4 w-4 rounded-full border-2 border-text-tertiary" />
      );
    case "locked":
    default:
      return (
        <svg className="h-4 w-4 text-text-tertiary/50" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
        </svg>
      );
  }
}

export function WizardStepper({ steps, currentCode, onSelectStep }: WizardStepperProps) {
  const stepMap = new Map(steps.map((s) => [s.controlCode, s]));
  const phases = [1, 2, 3, 4];

  return (
    <nav className="space-y-4">
      {phases.map((phase) => {
        const phaseControls = EU_AI_ACT_CONTROLS.filter((c) => c.phase === phase);
        return (
          <div key={phase}>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
              {PHASE_LABELS[phase]}
            </h3>
            <ul className="space-y-0.5">
              {phaseControls.map((control) => {
                const step = stepMap.get(control.code);
                const state = step?.state ?? "locked";
                const isActive = control.code === currentCode;
                const isClickable = state !== "locked";

                return (
                  <li key={control.code}>
                    <button
                      onClick={() => isClickable && onSelectStep(control.code)}
                      disabled={!isClickable}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
                        isActive
                          ? "bg-accent/10 text-accent font-medium"
                          : isClickable
                          ? "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                          : "text-text-tertiary/50 cursor-not-allowed"
                      }`}
                    >
                      <StateIcon state={state} />
                      <span className="truncate">{control.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
