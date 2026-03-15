"use client";

import type { StepRequirement } from "@/lib/wizard-types";

interface RequirementChecklistProps {
  requirements: StepRequirement[];
  disabled: boolean;
  onChange: (key: string, completed: boolean) => void;
}

export function RequirementChecklist({
  requirements,
  disabled,
  onChange,
}: RequirementChecklistProps) {
  return (
    <ul className="flex flex-col gap-2">
      {requirements.map((req) => {
        const id = `req-${req.key}`;
        return (
          <li key={req.key} className="flex items-start gap-2.5">
            <label
              htmlFor={id}
              className={[
                "group flex cursor-pointer items-start gap-2.5",
                disabled ? "cursor-not-allowed opacity-50" : "",
              ].join(" ")}
            >
              <span className="relative mt-0.5 flex h-4 w-4 flex-shrink-0">
                <input
                  id={id}
                  type="checkbox"
                  checked={req.completed}
                  disabled={disabled}
                  onChange={(e) => onChange(req.key, e.target.checked)}
                  className="peer sr-only"
                />
                <span
                  className={[
                    "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                    req.completed
                      ? "border-emerald-500 bg-emerald-500"
                      : "border-border bg-surface-1 peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
                    disabled
                      ? ""
                      : "group-hover:border-text-secondary",
                  ].join(" ")}
                >
                  {req.completed && (
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 6l3 3 5-5" />
                    </svg>
                  )}
                </span>
              </span>
              <span className="flex items-center gap-2 text-[13px] leading-snug text-text-primary">
                <span>{req.label}</span>
                {req.optional && (
                  <span className="inline-flex rounded border border-border bg-surface-2 px-1.5 py-0 text-[10px] font-medium text-text-tertiary">
                    Optional
                  </span>
                )}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
