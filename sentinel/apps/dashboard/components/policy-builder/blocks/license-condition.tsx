"use client";

import { useState, type KeyboardEvent } from "react";
import { z } from "zod";
import type { BlockPlugin, RuleNode } from "./types";

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function LicenseIcon({ className }: { className?: string }) {
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
      <rect x="2" y="1.5" width="12" height="13" rx="1.5" />
      <path d="M5 5h6" />
      <path d="M5 8h6" />
      <path d="M5 11h3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface LicenseConfig {
  licenses: string[];
}

const schema = z.object({
  licenses: z.array(z.string()),
});

const defaultConfig: LicenseConfig = { licenses: [] };

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function Renderer({ config }: { node: RuleNode; config: LicenseConfig }) {
  const label =
    config.licenses.length > 0
      ? config.licenses.join(", ")
      : "(none)";
  return (
    <span className="text-[13px] text-text-primary">
      <span className="font-semibold">License:</span> {label}
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
  config: LicenseConfig;
  onChange: (c: LicenseConfig) => void;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const value = input.trim();
    if (value && !config.licenses.includes(value)) {
      onChange({ ...config, licenses: [...config.licenses, value] });
    }
    setInput("");
  };

  const remove = (license: string) => {
    onChange({
      ...config,
      licenses: config.licenses.filter((l) => l !== license),
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-[11px] font-semibold text-text-secondary">
        Licenses
      </label>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="e.g. GPL-3.0, MIT — press Enter"
        className="rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
      />
      <div className="flex flex-wrap gap-1.5">
        {config.licenses.map((lic) => (
          <span
            key={lic}
            className="inline-flex items-center gap-1 rounded-lg bg-accent/20 border border-accent px-2 py-0.5 text-[13px] font-semibold text-accent"
          >
            {lic}
            <button
              type="button"
              onClick={() => remove(lic)}
              className="ml-0.5 text-accent hover:text-accent/70"
            >
              &times;
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const licenseConditionPlugin: BlockPlugin<LicenseConfig> = {
  type: "condition:license",
  category: "condition",
  label: "License",
  icon: LicenseIcon,
  defaultConfig,
  schema,
  Renderer,
  PropertyEditor,
};
