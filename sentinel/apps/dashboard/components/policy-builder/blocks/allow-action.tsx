"use client";

import { z } from "zod";
import type { BlockPlugin, RuleNode } from "./types";

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function AllowIcon({ className }: { className?: string }) {
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
      <circle cx="8" cy="8" r="6" />
      <path d="M5 8l2 2 4-4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type AllowConfig = Record<string, never>;

const schema = z.object({});
const defaultConfig: AllowConfig = {};

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function Renderer(_props: { node: RuleNode; config: AllowConfig }) {
  return (
    <span className="text-[13px] font-bold text-status-pass">
      Allow (pass-through)
    </span>
  );
}

// ---------------------------------------------------------------------------
// Property editor
// ---------------------------------------------------------------------------

function PropertyEditor(_props: {
  config: AllowConfig;
  onChange: (c: AllowConfig) => void;
}) {
  return (
    <p className="text-[13px] text-text-secondary">
      No configuration needed
    </p>
  );
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const allowActionPlugin: BlockPlugin<AllowConfig> = {
  type: "action:allow",
  category: "action",
  label: "Allow",
  icon: AllowIcon,
  defaultConfig,
  schema: schema as unknown as BlockPlugin<AllowConfig>["schema"],
  Renderer,
  PropertyEditor,
};
