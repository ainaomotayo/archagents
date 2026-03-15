"use client";

import { useState } from "react";
import type { AIMetricsConfig } from "@/lib/types";

// ── Exports for testing ────────────────────────────────

export const THRESHOLD_PRESETS = [
  { label: "Balanced", value: 0.5, description: "General use" },
  { label: "Conservative", value: 0.65, description: "Higher confidence" },
  { label: "Strict", value: 0.75, description: "Regulated industries" },
] as const;

export function validateThreshold(value: number): boolean {
  if (typeof value !== "number" || Number.isNaN(value)) return false;
  return value >= 0 && value <= 1;
}

// ── Component ──────────────────────────────────────────

interface Props {
  open: boolean;
  config: AIMetricsConfig;
  onClose: () => void;
  onSave: (data: Partial<AIMetricsConfig>) => Promise<void>;
}

export function AIMetricsConfigModal({ open, config, onClose, onSave }: Props) {
  const [threshold, setThreshold] = useState(config.threshold);
  const [strictMode, setStrictMode] = useState(config.strictMode);
  const [alertEnabled, setAlertEnabled] = useState(config.alertEnabled);
  const [alertNewTool, setAlertNewTool] = useState(config.alertNewTool);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function handleSave() {
    if (!validateThreshold(threshold)) return;
    setSaving(true);
    try {
      await onSave({ threshold, strictMode, alertEnabled, alertNewTool });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="animate-fade-up w-full max-w-md rounded-xl border border-border bg-surface-1 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">
            AI Metrics Configuration
          </h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Threshold slider */}
        <div className="mt-6">
          <label className="text-[12px] font-medium text-text-secondary">
            Detection Threshold: {(threshold * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={threshold * 100}
            onChange={(e) => setThreshold(Number(e.target.value) / 100)}
            className="mt-2 w-full"
          />
        </div>

        {/* Presets */}
        <div className="mt-4 flex gap-2">
          {THRESHOLD_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => setThreshold(preset.value)}
              className={`flex-1 rounded-lg border px-3 py-2 text-center text-[11px] transition-colors ${
                Math.abs(threshold - preset.value) < 0.01
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-text-secondary hover:border-border-accent"
              }`}
            >
              <div className="font-semibold">{preset.label}</div>
              <div className="mt-0.5 text-text-tertiary">{preset.description}</div>
            </button>
          ))}
        </div>

        {/* Toggles */}
        <div className="mt-6 space-y-3">
          <label className="flex items-center gap-3 text-[12px] text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={strictMode}
              onChange={(e) => setStrictMode(e.target.checked)}
              className="rounded border-border"
            />
            Strict mode
          </label>
          <label className="flex items-center gap-3 text-[12px] text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={alertEnabled}
              onChange={(e) => setAlertEnabled(e.target.checked)}
              className="rounded border-border"
            />
            Enable alerts
          </label>
          <label className="flex items-center gap-3 text-[12px] text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={alertNewTool}
              onChange={(e) => setAlertNewTool(e.target.checked)}
              className="rounded border-border"
            />
            Alert on new tool detection
          </label>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-[12px] font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !validateThreshold(threshold)}
            className="rounded-md bg-accent px-4 py-2 text-[12px] font-medium text-white transition-opacity disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
