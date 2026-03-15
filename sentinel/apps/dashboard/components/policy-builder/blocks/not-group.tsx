"use client";

import { z } from "zod";
import type { BlockPlugin, RuleNode } from "./types";

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function NotIcon({ className }: { className?: string }) {
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
      <path d="M4 12L12 4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type NotConfig = Record<string, never>;

const schema = z.object({});
const defaultConfig: NotConfig = {};

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function Renderer(_props: { node: RuleNode; config: NotConfig }) {
  return (
    <span className="text-[13px] font-bold text-status-fail border-l-2 border-status-fail pl-2">
      NONE of the following:
    </span>
  );
}

// ---------------------------------------------------------------------------
// Property editor
// ---------------------------------------------------------------------------

function PropertyEditor(_props: {
  config: NotConfig;
  onChange: (c: NotConfig) => void;
}) {
  return (
    <p className="text-[13px] text-text-secondary">
      Negates the child condition
    </p>
  );
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const notGroupPlugin: BlockPlugin<NotConfig> = {
  type: "group:not",
  category: "group",
  label: "NOT",
  icon: NotIcon,
  defaultConfig,
  schema: schema as unknown as BlockPlugin<NotConfig>["schema"],
  Renderer,
  PropertyEditor,
};
