"use client";

import type { WizardStep } from "@/lib/wizard-types";

interface GenericStepFormProps {
  step: WizardStep;
  guidance: string;
  onRequirementChange: (key: string, completed: boolean) => void;
  onJustificationChange: (text: string) => void;
  onUploadEvidence: () => void;
  onDeleteEvidence: (evidenceId: string) => void;
}

export function GenericStepForm({
  step,
  guidance,
  onRequirementChange,
  onJustificationChange,
  onUploadEvidence,
  onDeleteEvidence,
}: GenericStepFormProps) {
  const isEditable = step.state === "available" || step.state === "in_progress";

  return (
    <div className="space-y-6">
      {/* Guidance */}
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
        <h3 className="text-sm font-medium text-blue-400 mb-1">Guidance</h3>
        <p className="text-sm text-text-secondary leading-relaxed">{guidance}</p>
      </div>

      {/* Requirements Checklist */}
      <div className="rounded-xl border border-border bg-surface-1 p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Requirements</h3>
        <ul className="space-y-2.5">
          {step.requirements.map((req) => (
            <li key={req.key} className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={req.completed}
                disabled={!isEditable}
                onChange={(e) => onRequirementChange(req.key, e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border bg-surface-2 text-accent focus:ring-accent focus:ring-offset-0 disabled:opacity-50"
              />
              <div className="flex-1">
                <span className={`text-sm ${req.completed ? "text-text-primary" : "text-text-secondary"}`}>
                  {req.label}
                </span>
                {req.optional && (
                  <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
                    Optional
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 text-xs text-text-tertiary">
          {step.requirements.filter((r) => r.completed).length} of{" "}
          {step.requirements.filter((r) => !r.optional).length} required items completed
        </div>
      </div>

      {/* Justification / Notes */}
      <div className="rounded-xl border border-border bg-surface-1 p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Justification / Notes</h3>
        <textarea
          value={step.justification ?? ""}
          onChange={(e) => onJustificationChange(e.target.value)}
          disabled={!isEditable}
          placeholder="Add notes or justification for this control..."
          rows={4}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none disabled:opacity-50"
        />
      </div>

      {/* Evidence */}
      <div className="rounded-xl border border-border bg-surface-1 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">Evidence</h3>
          {isEditable && (
            <button
              onClick={onUploadEvidence}
              className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Upload File
            </button>
          )}
        </div>
        {step.evidence.length === 0 ? (
          <p className="text-sm text-text-tertiary">No evidence files attached yet.</p>
        ) : (
          <ul className="space-y-2">
            {step.evidence.map((ev) => (
              <li key={ev.id} className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-2/50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-text-tertiary" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-text-primary">{ev.fileName}</span>
                  <span className="text-xs text-text-tertiary">
                    {new Date(ev.uploadedAt).toLocaleDateString()}
                  </span>
                </div>
                {isEditable && (
                  <button
                    onClick={() => onDeleteEvidence(ev.id)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
