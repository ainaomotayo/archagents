import type { StepRequirement } from "./types.js";

export interface WizardStepHandler {
  code: string;
  validate(requirements: StepRequirement[], justification?: string): { valid: boolean; errors: string[] };
  getRequirements(): StepRequirement[];
  getGuidance(): string;
}

export class WizardStepRegistry {
  private handlers = new Map<string, WizardStepHandler>();

  register(handler: WizardStepHandler): void {
    if (this.handlers.has(handler.code)) {
      throw new Error(`Handler "${handler.code}" already registered`);
    }
    this.handlers.set(handler.code, handler);
  }

  get(code: string): WizardStepHandler {
    const h = this.handlers.get(code);
    if (!h) throw new Error(`No handler for control "${code}"`);
    return h;
  }

  has(code: string): boolean {
    return this.handlers.has(code);
  }

  getAll(): WizardStepHandler[] {
    return Array.from(this.handlers.values());
  }
}
