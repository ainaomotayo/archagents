"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Wizard, WizardStep, WizardProgress, WizardDocumentType } from "@/lib/wizard-types";
import { EU_AI_ACT_CONTROLS, DOCUMENT_TYPE_LABELS } from "@/lib/wizard-types";
import { WizardStepper } from "./WizardStepper";
import { WizardHeader } from "./WizardHeader";
import { StepHeader } from "./StepHeader";
import { StepFooter } from "./StepFooter";
import { GenericStepForm } from "./GenericStepForm";
import { ProgressSummary } from "./ProgressSummary";
import { DocumentGenerationPanel } from "./DocumentGenerationPanel";
import {
  updateStep,
  completeStep,
  skipStep,
  fetchWizard,
  deleteWizard,
  generateDocuments,
  uploadEvidence,
  deleteEvidence,
} from "@/lib/wizard-api";

interface WizardPageClientProps {
  wizard: Wizard;
}

// Guidance text for each control
const GUIDANCE: Record<string, string> = {
  "AIA-9": "Document your AI system's risk management process. Identify risks to health, safety, and fundamental rights. Define mitigation measures and testing procedures.",
  "AIA-10": "Establish data governance procedures. Assess training data quality, relevance, and representativeness. Document bias examination and mitigation steps.",
  "AIA-12": "Define what events and data points your system logs. Specify retention periods and ensure traceability of AI decisions.",
  "AIA-11": "Compile comprehensive technical documentation describing your AI system's design, development process, and validation procedures.",
  "AIA-13": "Ensure transparency by clearly communicating the system's purpose, limitations, accuracy levels, and human oversight measures to users.",
  "AIA-14": "Design and document human oversight mechanisms including override capabilities, intervention procedures, and training requirements.",
  "AIA-15": "Declare and measure accuracy levels. Demonstrate resilience to errors and adversarial attacks. Implement cybersecurity measures.",
  "AIA-17": "Establish a quality management system covering design, development, testing, and ongoing operations.",
  "AIA-26": "Verify deployer obligations: use in accordance with instructions, capable oversight personnel, input data monitoring, and user notification.",
  "AIA-47": "Complete the EU Declaration of Conformity with unique identifier, conformity assessment results, and applicable standards.",
  "AIA-60": "Define serious incident reporting procedures including timelines, authority identification, and corrective actions.",
  "AIA-61": "Establish a post-market monitoring plan with data collection, analysis, update procedures, and regular reporting.",
};

// Map document types to the controls that must be completed before generating
// Must stay in sync with DOC_PREREQUISITES in packages/compliance/src/wizard/wizard-service.ts
const DOC_BLOCKING_CONTROLS: Record<WizardDocumentType, string[]> = {
  technical_documentation: ["AIA-9", "AIA-10", "AIA-12", "AIA-14", "AIA-15"],
  declaration_of_conformity: [], // special: requires >= 90% overall progress
  instructions_for_use: ["AIA-9", "AIA-10", "AIA-13", "AIA-14", "AIA-15"],
  post_market_monitoring: ["AIA-17", "AIA-60", "AIA-61"],
};

export function WizardPageClient({ wizard: initialWizard }: WizardPageClientProps) {
  const router = useRouter();
  const [wizard, setWizard] = useState(initialWizard);
  const [currentCode, setCurrentCode] = useState(() => {
    const available = wizard.steps.find((s) => s.state === "in_progress" || s.state === "available");
    return available?.controlCode ?? wizard.steps[0]?.controlCode ?? "AIA-9";
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDocPanel, setShowDocPanel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentStep = wizard.steps.find((s) => s.controlCode === currentCode);

  const handleRequirementChange = useCallback(async (key: string, completed: boolean) => {
    if (!currentStep) return;
    setSaving(true);
    try {
      await updateStep(wizard.id, currentCode, {
        requirements: [{ key, completed }],
      });
      setWizard((prev) => ({
        ...prev,
        steps: prev.steps.map((s) =>
          s.controlCode === currentCode
            ? {
                ...s,
                state: s.state === "available" ? ("in_progress" as const) : s.state,
                requirements: s.requirements.map((r) =>
                  r.key === key ? { ...r, completed } : r
                ),
              }
            : s
        ),
      }));
    } catch (err: any) {
      setError(err.message ?? "Failed to update requirement");
    } finally {
      setSaving(false);
    }
  }, [wizard.id, currentCode, currentStep]);

  const handleJustificationChange = useCallback(async (text: string) => {
    setWizard((prev) => ({
      ...prev,
      steps: prev.steps.map((s) =>
        s.controlCode === currentCode ? { ...s, justification: text } : s
      ),
    }));
  }, [currentCode]);

  const handleSave = useCallback(async () => {
    if (!currentStep) return;
    setSaving(true);
    try {
      await updateStep(wizard.id, currentCode, {
        justification: currentStep.justification ?? undefined,
      });
    } catch (err: any) {
      setError(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [wizard.id, currentCode, currentStep]);

  const handleComplete = useCallback(async () => {
    setSaving(true);
    try {
      await completeStep(wizard.id, currentCode);
      const updated = await fetchWizard(wizard.id);
      setWizard(updated);
    } catch (err: any) {
      setError(err.message ?? "Failed to complete step");
    } finally {
      setSaving(false);
    }
  }, [wizard.id, currentCode]);

  const handleSkip = useCallback(async (reason: string) => {
    setSaving(true);
    try {
      await skipStep(wizard.id, currentCode, reason);
      const updated = await fetchWizard(wizard.id);
      setWizard(updated);
    } catch (err: any) {
      setError(err.message ?? "Failed to skip step");
    } finally {
      setSaving(false);
    }
  }, [wizard.id, currentCode]);

  const handleUploadEvidence = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      // Compute SHA-256
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const sha256 = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      const result = await uploadEvidence(wizard.id, currentCode, {
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        storageKey: `evidence/${wizard.id}/${currentCode}/${sha256.slice(0, 12)}-${file.name}`,
        sha256,
      });

      setWizard((prev) => ({
        ...prev,
        steps: prev.steps.map((s) =>
          s.controlCode === currentCode
            ? { ...s, evidence: [...s.evidence, result.evidence] }
            : s
        ),
      }));
    } catch (err: any) {
      setError(err.message ?? "Failed to upload evidence");
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [wizard.id, currentCode]);

  const handleDeleteEvidence = useCallback(async (evidenceId: string) => {
    setSaving(true);
    try {
      await deleteEvidence(wizard.id, currentCode, evidenceId);
      setWizard((prev) => ({
        ...prev,
        steps: prev.steps.map((s) =>
          s.controlCode === currentCode
            ? { ...s, evidence: s.evidence.filter((ev) => ev.id !== evidenceId) }
            : s
        ),
      }));
    } catch (err: any) {
      setError(err.message ?? "Failed to delete evidence");
    } finally {
      setSaving(false);
    }
  }, [wizard.id, currentCode]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteWizard(wizard.id);
      router.push("/compliance/wizards");
    } catch (err: any) {
      setError(err.message ?? "Failed to delete wizard");
    }
  }, [wizard.id, router]);

  const handleGenerateDocuments = useCallback(async (docTypes: WizardDocumentType[]) => {
    setSaving(true);
    try {
      const result = await generateDocuments(wizard.id, docTypes);
      setWizard((prev) => ({
        ...prev,
        documents: [
          ...prev.documents.filter((d) => !docTypes.includes(d.documentType as WizardDocumentType)),
          ...result.documents,
        ],
      }));
    } catch (err: any) {
      setError(err.message ?? "Failed to generate documents");
    } finally {
      setSaving(false);
    }
  }, [wizard.id]);

  const canCompleteStep = currentStep
    ? currentStep.requirements
        .filter((r) => !r.optional)
        .every((r) => r.completed)
    : false;

  const progress: WizardProgress = {
    overall: wizard.progress,
    completedSteps: wizard.steps.filter((s) => s.state === "completed").length,
    totalSteps: wizard.steps.length,
    skippedSteps: wizard.steps.filter((s) => s.state === "skipped").length,
    phaseProgress: [1, 2, 3, 4].reduce((acc, phase) => {
      const phaseSteps = wizard.steps.filter((s) => s.phase === phase);
      acc[phase] = {
        completed: phaseSteps.filter((s) => s.state === "completed" || s.state === "skipped").length,
        total: phaseSteps.length,
      };
      return acc;
    }, {} as Record<number, { completed: number; total: number }>),
    availableSteps: wizard.steps.filter((s) => s.state === "available").map((s) => s.controlCode),
    blockingSteps: [],
  };

  // Compute blocking steps for document generation
  const completedCodes = new Set(
    wizard.steps
      .filter((s) => s.state === "completed" || s.state === "skipped")
      .map((s) => s.controlCode),
  );
  const docBlockingSteps: Record<string, string[]> = {};
  for (const [docType, requiredCodes] of Object.entries(DOC_BLOCKING_CONTROLS)) {
    if (docType === "declaration_of_conformity") {
      // Special: requires >= 90% overall progress
      if (progress.overall < 0.9) {
        const incomplete = wizard.steps
          .filter((s) => s.state !== "completed" && s.state !== "skipped")
          .map((s) => s.controlCode);
        docBlockingSteps[docType] = incomplete;
      }
      continue;
    }
    const blocking = requiredCodes.filter((c) => !completedCodes.has(c));
    if (blocking.length > 0) {
      docBlockingSteps[docType] = blocking;
    }
  }

  return (
    <div className="flex h-full flex-col">
      <WizardHeader
        wizard={wizard}
        onGenerateDocuments={() => setShowDocPanel(!showDocPanel)}
        onDelete={() => setShowDeleteConfirm(true)}
      />

      {/* Hidden file input for evidence upload */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Error banner */}
      {error && (
        <div className="border-b border-red-500/20 bg-red-500/5 px-6 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-xs text-red-400 hover:text-red-300 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="border-b border-red-500/20 bg-red-500/5 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-400">Delete this wizard?</p>
              <p className="text-xs text-text-secondary mt-0.5">
                This will permanently delete &quot;{wizard.name}&quot; and all its progress. This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 transition-colors"
              >
                Delete Wizard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document generation panel */}
      {showDocPanel && (
        <div className="border-b border-border bg-surface-1 px-6 py-4">
          <DocumentGenerationPanel
            documents={wizard.documents}
            blockingSteps={docBlockingSteps}
            onGenerate={handleGenerateDocuments}
          />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Stepper */}
        <div className="w-[280px] flex-shrink-0 overflow-y-auto border-r border-border bg-surface-1 p-4">
          <WizardStepper
            steps={wizard.steps}
            currentCode={currentCode}
            onSelectStep={setCurrentCode}
          />
          <div className="mt-6 border-t border-border-subtle pt-4">
            <ProgressSummary progress={progress} />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentStep ? (
            <div className="mx-auto max-w-3xl space-y-6">
              <StepHeader step={currentStep} />

              <GenericStepForm
                step={currentStep}
                guidance={GUIDANCE[currentCode] ?? "Complete the requirements for this control."}
                onRequirementChange={handleRequirementChange}
                onJustificationChange={handleJustificationChange}
                onUploadEvidence={handleUploadEvidence}
                onDeleteEvidence={handleDeleteEvidence}
              />

              <StepFooter
                step={currentStep}
                onComplete={handleComplete}
                onSkip={handleSkip}
                onSave={handleSave}
                canComplete={canCompleteStep}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-text-tertiary">
              Select a step from the sidebar
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
