"use client";

import { useState, useCallback } from "react";
import type { Wizard, WizardStep, WizardProgress } from "@/lib/wizard-types";
import { EU_AI_ACT_CONTROLS } from "@/lib/wizard-types";
import { WizardStepper } from "./WizardStepper";
import { WizardHeader } from "./WizardHeader";
import { StepHeader } from "./StepHeader";
import { StepFooter } from "./StepFooter";
import { GenericStepForm } from "./GenericStepForm";
import { ProgressSummary } from "./ProgressSummary";
import { updateStep, completeStep, skipStep } from "@/lib/wizard-api";

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

export function WizardPageClient({ wizard: initialWizard }: WizardPageClientProps) {
  const [wizard, setWizard] = useState(initialWizard);
  const [currentCode, setCurrentCode] = useState(() => {
    // Start with first in-progress or available step
    const available = wizard.steps.find((s) => s.state === "in_progress" || s.state === "available");
    return available?.controlCode ?? wizard.steps[0]?.controlCode ?? "AIA-9";
  });
  const [saving, setSaving] = useState(false);

  const currentStep = wizard.steps.find((s) => s.controlCode === currentCode);

  const handleRequirementChange = useCallback(async (key: string, completed: boolean) => {
    if (!currentStep) return;
    setSaving(true);
    try {
      await updateStep(wizard.id, currentCode, {
        requirements: [{ key, completed }],
      });
      // Optimistic update
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
    } catch (err) {
      console.error("Failed to update requirement", err);
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
    } catch (err) {
      console.error("Failed to save", err);
    } finally {
      setSaving(false);
    }
  }, [wizard.id, currentCode, currentStep]);

  const handleComplete = useCallback(async () => {
    setSaving(true);
    try {
      await completeStep(wizard.id, currentCode);
      setWizard((prev) => ({
        ...prev,
        steps: prev.steps.map((s) =>
          s.controlCode === currentCode
            ? { ...s, state: "completed" as const, completedAt: new Date().toISOString() }
            : s
        ),
      }));
    } catch (err) {
      console.error("Failed to complete step", err);
    } finally {
      setSaving(false);
    }
  }, [wizard.id, currentCode]);

  const handleSkip = useCallback(async (reason: string) => {
    setSaving(true);
    try {
      await skipStep(wizard.id, currentCode, reason);
      setWizard((prev) => ({
        ...prev,
        steps: prev.steps.map((s) =>
          s.controlCode === currentCode
            ? { ...s, state: "skipped" as const, skipReason: reason }
            : s
        ),
      }));
    } catch (err) {
      console.error("Failed to skip step", err);
    } finally {
      setSaving(false);
    }
  }, [wizard.id, currentCode]);

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

  return (
    <div className="flex h-full flex-col">
      <WizardHeader
        wizard={wizard}
        onGenerateDocuments={() => {}}
        onDelete={() => {}}
      />

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
                onUploadEvidence={() => {}}
                onDeleteEvidence={() => {}}
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
