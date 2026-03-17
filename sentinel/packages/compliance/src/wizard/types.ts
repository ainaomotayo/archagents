export type WizardStatus = "active" | "generating" | "completed" | "archived";
export type StepState = "locked" | "available" | "in_progress" | "completed" | "skipped";
export type WizardDocumentType =
  | "technical_documentation"
  | "declaration_of_conformity"
  | "instructions_for_use"
  | "post_market_monitoring";

export type WizardEventKind =
  | "wizard_created"
  | "step_started"
  | "step_completed"
  | "step_skipped"
  | "step_unlocked"
  | "evidence_uploaded"
  | "evidence_deleted"
  | "document_generated"
  | "wizard_completed";

export interface StepRequirement {
  key: string;
  label: string;
  completed: boolean;
  optional: boolean;
}

export interface WizardControlMeta {
  code: string;
  article: string;
  title: string;
  phase: number;
  dependencies: string[];
  requirements: StepRequirement[];
  documentContributions: WizardDocumentType[];
  skipUnlocksDependents: boolean;
}

export interface WizardProgress {
  overall: number;
  completedSteps: number;
  totalSteps: number;
  skippedSteps: number;
  phaseProgress: Record<number, { completed: number; total: number }>;
  availableSteps: string[];
  blockingSteps: string[];
}

export interface StepUpdatePayload {
  justification?: string;
  requirements?: Array<{ key: string; completed: boolean }>;
}
