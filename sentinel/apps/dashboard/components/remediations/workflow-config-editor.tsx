"use client";

import { useState, useCallback } from "react";

interface WorkflowConfigEditorProps {
  initialSkipStages: string[];
  onSave: (skipStages: string[]) => Promise<void>;
}

const ALL_STAGES = [
  { key: "assigned", label: "Assigned", description: "Item is assigned to an owner" },
  { key: "in_progress", label: "In Progress", description: "Work has started on the item" },
  { key: "in_review", label: "In Review", description: "Fix is being reviewed" },
  { key: "awaiting_deployment", label: "Awaiting Deployment", description: "Fix approved, waiting to deploy" },
];

const FIXED_STAGES = [
  { key: "open", label: "Open", description: "Newly created item" },
  { key: "completed", label: "Completed", description: "Item is resolved" },
];

export function WorkflowConfigEditor({ initialSkipStages, onSave }: WorkflowConfigEditorProps) {
  const [skipStages, setSkipStages] = useState<Set<string>>(new Set(initialSkipStages));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleStage = useCallback((key: string) => {
    setSkipStages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    setSaved(false);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await onSave(Array.from(skipStages));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save workflow configuration.");
    } finally {
      setSaving(false);
    }
  }, [skipStages, onSave]);

  // Build the active pipeline for preview
  const activePipeline = [
    FIXED_STAGES[0],
    ...ALL_STAGES.filter((s) => !skipStages.has(s.key)),
    FIXED_STAGES[1],
  ];

  return (
    <div className="space-y-6">
      {/* Stage toggles */}
      <div>
        <h3 className="mb-3 text-[13px] font-semibold text-text-primary">Skippable Stages</h3>
        <p className="mb-4 text-[12px] text-text-secondary">
          Toggle stages on or off. Disabled stages will be skipped in the remediation workflow.
        </p>
        <div className="space-y-2">
          {ALL_STAGES.map((stage) => {
            const isSkipped = skipStages.has(stage.key);
            return (
              <div
                key={stage.key}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-0/50 px-4 py-3"
              >
                <div>
                  <p className="text-[13px] font-medium text-text-primary">{stage.label}</p>
                  <p className="text-[11px] text-text-tertiary">{stage.description}</p>
                </div>
                <button
                  onClick={() => toggleStage(stage.key)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    !isSkipped ? "bg-accent" : "bg-surface-3"
                  }`}
                  role="switch"
                  aria-checked={!isSkipped}
                  aria-label={`${stage.label} stage`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      !isSkipped ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pipeline preview */}
      <div>
        <h3 className="mb-3 text-[13px] font-semibold text-text-primary">Pipeline Preview</h3>
        <div className="flex flex-wrap items-center gap-1">
          {activePipeline.map((stage, idx) => (
            <div key={stage.key} className="flex items-center gap-1">
              <span
                className={`rounded-md px-3 py-1.5 text-[11px] font-semibold ${
                  stage.key === "open"
                    ? "bg-status-fail/15 text-status-fail"
                    : stage.key === "completed"
                      ? "bg-status-pass/15 text-status-pass"
                      : "bg-accent/10 text-accent"
                }`}
              >
                {stage.label}
              </span>
              {idx < activePipeline.length - 1 && (
                <svg
                  className="h-4 w-4 text-text-tertiary"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save Configuration"}
        </button>
        {saved && (
          <span className="text-[12px] font-medium text-status-pass">Saved successfully</span>
        )}
        {error && (
          <span className="text-[12px] text-status-fail">{error}</span>
        )}
      </div>
    </div>
  );
}
