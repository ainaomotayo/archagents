"use client";

import { z } from "zod";
import type { BlockPlugin, RuleNode } from "./types";

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function OrIcon({ className }: { className?: string }) {
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
      <path d="M3 3c3 0 5 5 5 5s2-5 5-5" />
      <path d="M3 13c3 0 5-5 5-5s2 5 5 5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type OrConfig = Record<string, never>;

const schema = z.object({});
const defaultConfig: OrConfig = {};

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function Renderer(_props: { node: RuleNode; config: OrConfig }) {
  return (
    <span className="text-[13px] font-bold text-status-warn border-l-2 border-status-warn pl-2">
      ANY of the following:
    </span>
  );
}

// ---------------------------------------------------------------------------
// Property editor
// ---------------------------------------------------------------------------

function PropertyEditor(_props: {
  config: OrConfig;
  onChange: (c: OrConfig) => void;
}) {
  return (
    <p className="text-[13px] text-text-secondary">
      Any condition can match
    </p>
  );
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const orGroupPlugin: BlockPlugin<OrConfig> = {
  type: "group:or",
  category: "group",
  label: "OR",
  icon: OrIcon,
  defaultConfig,
  schema: schema as unknown as BlockPlugin<OrConfig>["schema"],
  Renderer,
  PropertyEditor,
};
