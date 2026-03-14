"use client";

import { useState, type KeyboardEvent } from "react";
import { z } from "zod";
import type { BlockPlugin, RuleNode } from "./types";

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function CategoryIcon({ className }: { className?: string }) {
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
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface CategoryConfig {
  categories: string[];
}

const schema = z.object({
  categories: z.array(z.string()),
});

const defaultConfig: CategoryConfig = { categories: [] };

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function Renderer({ config }: { node: RuleNode; config: CategoryConfig }) {
  const label =
    config.categories.length > 0
      ? config.categories.join(", ")
      : "(none)";
  return (
    <span className="text-[13px] text-text-primary">
      <span className="font-semibold">Category:</span> {label}
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
  config: CategoryConfig;
  onChange: (c: CategoryConfig) => void;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const value = input.trim();
    if (value && !config.categories.includes(value)) {
      onChange({ ...config, categories: [...config.categories, value] });
    }
    setInput("");
  };

  const remove = (cat: string) => {
    onChange({
      ...config,
      categories: config.categories.filter((c) => c !== cat),
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
        Categories
      </label>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type and press Enter"
        className="rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
      />
      <div className="flex flex-wrap gap-1.5">
        {config.categories.map((cat) => (
          <span
            key={cat}
            className="inline-flex items-center gap-1 rounded-lg bg-accent/20 border border-accent px-2 py-0.5 text-[13px] font-semibold text-accent"
          >
            {cat}
            <button
              type="button"
              onClick={() => remove(cat)}
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

export const categoryConditionPlugin: BlockPlugin<CategoryConfig> = {
  type: "condition:category",
  category: "condition",
  label: "Category",
  icon: CategoryIcon,
  defaultConfig,
  schema,
  Renderer,
  PropertyEditor,
};
