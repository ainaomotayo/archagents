"use client";

import { z } from "zod";
import type { BlockPlugin, RuleNode } from "./types";

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function BlockIcon({ className }: { className?: string }) {
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
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <path d="M5 5l6 6" />
      <path d="M11 5l-6 6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface BlockActionConfig {
  reason: string;
}

const schema = z.object({
  reason: z.string(),
});

const defaultConfig: BlockActionConfig = { reason: "" };

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function Renderer({ config }: { node: RuleNode; config: BlockActionConfig }) {
  return (
    <span className="text-[13px] text-status-fail">
      <span className="font-bold">Block:</span>{" "}
      {config.reason || "(no reason)"}
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
  config: BlockActionConfig;
  onChange: (c: BlockActionConfig) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold text-text-secondary">
        Reason
      </label>
      <input
        type="text"
        value={config.reason}
        onChange={(e) => onChange({ ...config, reason: e.target.value })}
        placeholder="Why is this blocked?"
        className="rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const blockActionPlugin: BlockPlugin<BlockActionConfig> = {
  type: "action:block",
  category: "action",
  label: "Block",
  icon: BlockIcon,
  defaultConfig,
  schema,
  Renderer,
  PropertyEditor,
};
