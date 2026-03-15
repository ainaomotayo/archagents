import type { WizardStepHandler } from "../step-handler.js";
import type { StepRequirement } from "../types.js";
import { EU_AI_ACT_CONTROL_MAP } from "../eu-ai-act-controls.js";

export function createHandler(code: string, guidance: string): WizardStepHandler {
  const control = EU_AI_ACT_CONTROL_MAP.get(code);
  if (!control) throw new Error(`Unknown control: ${code}`);

  return {
    code,
    validate(requirements: StepRequirement[]) {
      const errors: string[] = [];
      for (const req of requirements) {
        if (!req.optional && !req.completed) {
          errors.push(`Requirement "${req.key}" is not completed`);
        }
      }
      return { valid: errors.length === 0, errors };
    },
    getRequirements() {
      return control.requirements.map((r) => ({ ...r }));
    },
    getGuidance() {
      return guidance;
    },
  };
}
