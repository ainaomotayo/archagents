"use client";

import { useState } from "react";
import Link from "next/link";
import { IconCheckCircle, IconCheck, IconChevronLeft } from "@/components/icons";

interface OnboardingChecklistProps {
  completedSteps: string[];
}

const STEPS = [
  { id: "connect", label: "Connect a repository", href: "/settings/vcs" },
  { id: "scan", label: "Trigger your first scan", href: "/projects" },
  { id: "review", label: "Review your findings", href: "/findings" },
  { id: "compliance", label: "Configure a compliance framework", href: "/compliance" },
];

export function OnboardingChecklist({ completedSteps }: OnboardingChecklistProps) {
  const [open, setOpen] = useState(true);
  const allDone = STEPS.every((s) => completedSteps.includes(s.id));
  const doneCount = STEPS.filter((s) => completedSteps.includes(s.id)).length;

  if (allDone) {
    return (
      <div className="rounded-xl border border-border bg-surface-1 p-4 flex items-center gap-3">
        <IconCheckCircle className="h-5 w-5 shrink-0 text-status-pass" />
        <div>
          <p className="text-[13px] font-semibold text-text-primary">You&apos;re all set!</p>
          <p className="text-[11px] text-text-tertiary">All onboarding steps completed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[13px] font-semibold text-text-primary">Getting started</span>
          <p className="text-[10px] text-text-tertiary mt-0.5">
            {doneCount} / {STEPS.length} complete
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Collapse checklist" : "Expand checklist"}
          aria-expanded={open}
          aria-controls="checklist-steps"
          className="flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary hover:text-text-secondary hover:bg-surface-2 transition-colors"
        >
          <IconChevronLeft
            className="h-4 w-4 transition-transform duration-200"
            style={{ transform: open ? "rotate(-90deg)" : "rotate(90deg)" }}
          />
        </button>
      </div>

      {/* Step list */}
      {open && (
        <ul id="checklist-steps" className="mt-3 space-y-2">
          {STEPS.map((step) => {
            const done = completedSteps.includes(step.id);
            return (
              <li key={step.id} className="flex items-center gap-3">
                {/* Checkbox indicator */}
                {done ? (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-status-pass text-white">
                    <IconCheck className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                ) : (
                  <span className="h-4 w-4 shrink-0 rounded-full border-2 border-border" />
                )}

                {/* Label */}
                {done ? (
                  <span className="text-[12px] text-text-tertiary line-through">
                    {step.label}
                  </span>
                ) : (
                  <Link
                    href={step.href}
                    className="text-[12px] font-medium text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {step.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
