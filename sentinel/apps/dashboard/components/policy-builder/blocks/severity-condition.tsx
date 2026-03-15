"use client";

import { z } from "zod";
import type { BlockPlugin, RuleNode } from "./types";

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function SeverityIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 2 L14 13 L2 13 Z" />
      <path d="M8 6.5V9.5" />
      <circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SEVERITY_LEVELS = ["critical", "high", "medium", "low", "info"] as const;

export interface SeverityConfig {
  severities: string[];
}

const schema = z.object({
  severities: z.array(z.string()),
});

const defaultConfig: SeverityConfig = { severities: [] };

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function Renderer({ config }: { node: RuleNode; config: SeverityConfig }) {
  const label =
    config.severities.length > 0
      ? config.severities.join(", ")
      : "(none)";
  return (
    <span className="text-[13px] text-text-primary">
      <span className="font-semibold">Severity:</span> {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Property editor
// ---------------------------------------------------------------------------

function PropertyEditor({
  config,
  onChange,
}: {
  config: SeverityConfig;
  onChange: (c: SeverityConfig) => void;
}) {
  const toggle = (level: string) => {
    const next = config.severities.includes(level)
      ? config.severities.filter((s) => s !== level)
      : [...config.severities, level];
    onChange({ ...config, severities: next });
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-[11px] font-semibold text-text-secondary">
        Severity levels
      </label>
      <div className="flex flex-wrap gap-1.5">
        {SEVERITY_LEVELS.map((level) => {
          const active = config.severities.includes(level);
          return (
            <button
              key={level}
              type="button"
              onClick={() => toggle(level)}
              className={`rounded-lg px-2.5 py-1 text-[13px] font-semibold border transition-colors ${
                active
                  ? "bg-accent/20 border-accent text-accent"
                  : "bg-surface-1 border-border text-text-primary hover:border-accent/40"
              }`}
            >
              {level}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const severityConditionPlugin: BlockPlugin<SeverityConfig> = {
  type: "condition:severity",
  category: "condition",
  label: "Severity",
  icon: SeverityIcon,
  defaultConfig,
  schema,
  Renderer,
  PropertyEditor,
};
