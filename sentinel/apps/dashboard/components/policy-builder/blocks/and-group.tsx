"use client";

import { z } from "zod";
import type { BlockPlugin, RuleNode } from "./types";

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function AndIcon({ className }: { className?: string }) {
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
      <path d="M4 3v10" />
      <path d="M4 3h4a4 4 0 0 1 0 4H4" />
      <path d="M4 7h4a4 4 0 0 1 0 4H4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type AndConfig = Record<string, never>;

const schema = z.object({});
const defaultConfig: AndConfig = {};

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function Renderer(_props: { node: RuleNode; config: AndConfig }) {
  return (
    <span className="text-[13px] font-bold text-accent border-l-2 border-accent pl-2">
      ALL of the following:
    </span>
  );
}

// ---------------------------------------------------------------------------
// Property editor
// ---------------------------------------------------------------------------

function PropertyEditor(_props: {
  config: AndConfig;
  onChange: (c: AndConfig) => void;
}) {
  return (
    <p className="text-[13px] text-text-secondary">
      All conditions must match
    </p>
  );
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const andGroupPlugin: BlockPlugin<AndConfig> = {
  type: "group:and",
  category: "group",
  label: "AND",
  icon: AndIcon,
  defaultConfig,
  schema: schema as unknown as BlockPlugin<AndConfig>["schema"],
  Renderer,
  PropertyEditor,
};
