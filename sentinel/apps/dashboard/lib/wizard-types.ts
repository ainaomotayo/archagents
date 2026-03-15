export type WizardStatus = "active" | "generating" | "completed" | "archived";
export type StepState = "locked" | "available" | "in_progress" | "completed" | "skipped";
export type WizardDocumentType =
  | "technical_documentation"
  | "declaration_of_conformity"
  | "instructions_for_use"
  | "post_market_monitoring";

export interface StepRequirement {
  key: string;
  label: string;
  completed: boolean;
  optional: boolean;
}

export interface WizardStep {
  id: string;
  wizardId: string;
  controlCode: string;
  phase: number;
  state: StepState;
  requirements: StepRequirement[];
  justification: string | null;
  skipReason: string | null;
  completedAt: string | null;
  updatedAt: string;
  evidence: WizardEvidence[];
}

export interface WizardEvidence {
  id: string;
  stepId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
  sha256: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface Wizard {
  id: string;
  orgId: string;
  frameworkCode: string;
  name: string;
  status: WizardStatus;
  progress: number;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  steps: WizardStep[];
  documents: WizardDocument[];
}

export interface WizardDocument {
  id: string;
  wizardId: string;
  documentType: WizardDocumentType;
  reportId: string | null;
  status: "pending" | "generating" | "ready" | "failed";
  error: string | null;
  generatedAt: string | null;
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

// EU AI Act control metadata (mirrors backend)
export interface WizardControlMeta {
  code: string;
  article: string;
  title: string;
  phase: number;
}

export const EU_AI_ACT_CONTROLS: WizardControlMeta[] = [
  { code: "AIA-9", article: "Art. 9", title: "Risk Management System", phase: 1 },
  { code: "AIA-10", article: "Art. 10", title: "Data & Data Governance", phase: 1 },
  { code: "AIA-12", article: "Art. 12", title: "Record-Keeping (Logging)", phase: 1 },
  { code: "AIA-11", article: "Art. 11", title: "Technical Documentation", phase: 2 },
  { code: "AIA-13", article: "Art. 13", title: "Transparency & User Info", phase: 2 },
  { code: "AIA-14", article: "Art. 14", title: "Human Oversight", phase: 2 },
  { code: "AIA-15", article: "Art. 15", title: "Accuracy, Robustness & Cybersecurity", phase: 2 },
  { code: "AIA-17", article: "Art. 17", title: "Quality Management System", phase: 3 },
  { code: "AIA-26", article: "Art. 26", title: "Obligations of Deployers", phase: 3 },
  { code: "AIA-47", article: "Art. 47", title: "EU Declaration of Conformity", phase: 3 },
  { code: "AIA-60", article: "Art. 60", title: "Serious Incident Reporting", phase: 4 },
  { code: "AIA-61", article: "Art. 61", title: "Post-Market Monitoring", phase: 4 },
];

export const DOCUMENT_TYPE_LABELS: Record<WizardDocumentType, string> = {
  technical_documentation: "Technical Documentation",
  declaration_of_conformity: "Declaration of Conformity",
  instructions_for_use: "Instructions for Use",
  post_market_monitoring: "Post-Market Monitoring Plan",
};
