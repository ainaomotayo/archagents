import type { StepState, StepRequirement } from "./types.js";

export interface TransitionResult {
  valid: boolean;
  error?: string;
}

const VALID_TRANSITIONS: Record<StepState, StepState[]> = {
  locked: ["available"],
  available: ["in_progress", "skipped"],
  in_progress: ["completed", "skipped", "available"],
  completed: ["in_progress"],
  skipped: ["available"],
};

export function canTransition(from: StepState, to: StepState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function validateTransition(
  from: StepState,
  to: StepState,
  context: { requirements?: StepRequirement[]; skipReason?: string },
): TransitionResult {
  if (!canTransition(from, to)) {
    return { valid: false, error: `Cannot transition from "${from}" to "${to}"` };
  }

  if (to === "completed" && context.requirements) {
    return canComplete(context.requirements);
  }

  if (to === "skipped") {
    return canSkip(context.skipReason);
  }

  return { valid: true };
}

export function canComplete(requirements: StepRequirement[]): TransitionResult {
  const unmet = requirements.filter((r) => !r.optional && !r.completed);
  if (unmet.length > 0) {
    return {
      valid: false,
      error: `${unmet.length} required requirement(s) not completed: ${unmet.map((r) => r.key).join(", ")}`,
    };
  }
  return { valid: true };
}

export function canSkip(reason?: string): TransitionResult {
  if (!reason || reason.trim().length === 0) {
    return { valid: false, error: "Skip reason is required" };
  }
  return { valid: true };
}
