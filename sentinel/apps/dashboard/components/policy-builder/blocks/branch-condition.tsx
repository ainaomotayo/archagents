"use client";

import { useState, type KeyboardEvent } from "react";
import { z } from "zod";
import type { BlockPlugin, RuleNode } from "./types";

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function BranchIcon({ className }: { className?: string }) {
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
      <circle cx="4" cy="4" r="1.5" />
      <circle cx="4" cy="12" r="1.5" />
      <circle cx="12" cy="7" r="1.5" />
      <path d="M4 5.5v5" />
      <path d="M4 6.5c0-1.5 1.5-1 4-1s4 0 4 1.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface BranchConfig {
  patterns: string[];
}

const schema = z.object({
  patterns: z.array(z.string()),
});

const defaultConfig: BranchConfig = { patterns: [] };

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function Renderer({ config }: { node: RuleNode; config: BranchConfig }) {
  const label =
    config.patterns.length > 0
      ? config.patterns.join(", ")
      : "(none)";
  return (
    <span className="text-[13px] text-text-primary">
      <span className="font-semibold">Branch:</span> {label}
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
  config: BranchConfig;
  onChange: (c: BranchConfig) => void;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const value = input.trim();
    if (value && !config.patterns.includes(value)) {
      onChange({ ...config, patterns: [...config.patterns, value] });
    }
    setInput("");
  };

  const remove = (pattern: string) => {
    onChange({
      ...config,
      patterns: config.patterns.filter((p) => p !== pattern),
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
        Branch patterns
      </label>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="e.g. main, release/* — press Enter"
        className="rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
      />
      <div className="flex flex-wrap gap-1.5">
        {config.patterns.map((pat) => (
          <span
            key={pat}
            className="inline-flex items-center gap-1 rounded-lg bg-accent/20 border border-accent px-2 py-0.5 text-[13px] font-semibold text-accent"
          >
            {pat}
            <button
              type="button"
              onClick={() => remove(pat)}
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

export const branchConditionPlugin: BlockPlugin<BranchConfig> = {
  type: "condition:branch",
  category: "condition",
  label: "Branch",
  icon: BranchIcon,
  defaultConfig,
  schema,
  Renderer,
  PropertyEditor,
};
