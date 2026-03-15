"use client";

import { z } from "zod";
import type { BlockPlugin, RuleNode } from "./types";

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function ReviewIcon({ className }: { className?: string }) {
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
      <circle cx="8" cy="7" r="3" />
      <path d="M2 7c0-3 3-5.5 6-5.5s6 2.5 6 5.5-3 5.5-6 5.5S2 10 2 7z" />
      <path d="M8 12.5V15" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface ReviewActionConfig {
  assigneeRole: string;
  slaHours: number;
  escalateAfterHours?: number;
  expiryAction?: string;
}

const schema = z.object({
  assigneeRole: z.string(),
  slaHours: z.number(),
  escalateAfterHours: z.number().optional(),
  expiryAction: z.string().optional(),
});

const defaultConfig: ReviewActionConfig = {
  assigneeRole: "manager",
  slaHours: 24,
};

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function Renderer({ config }: { node: RuleNode; config: ReviewActionConfig }) {
  return (
    <span className="text-[13px] text-text-primary">
      <span className="font-bold">Review</span> by{" "}
      <span className="font-semibold text-accent">{config.assigneeRole}</span>{" "}
      within {config.slaHours}h
    </span>
  );
}

// ---------------------------------------------------------------------------
// Property editor
// ---------------------------------------------------------------------------

const ROLES = ["admin", "manager", "developer"] as const;

function PropertyEditor({
  config,
  onChange,
}: {
  config: ReviewActionConfig;
  onChange: (c: ReviewActionConfig) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold text-text-secondary">
          Assignee role
        </label>
        <select
          value={config.assigneeRole}
          onChange={(e) =>
            onChange({ ...config, assigneeRole: e.target.value })
          }
          className="rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-[13px] text-text-primary focus:border-accent focus:outline-none"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold text-text-secondary">
          SLA (hours)
        </label>
        <input
          type="number"
          min={1}
          value={config.slaHours}
          onChange={(e) =>
            onChange({ ...config, slaHours: Number(e.target.value) })
          }
          className="rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-[13px] text-text-primary focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold text-text-secondary">
          Escalate after (hours, optional)
        </label>
        <input
          type="number"
          min={1}
          value={config.escalateAfterHours ?? ""}
          onChange={(e) =>
            onChange({
              ...config,
              escalateAfterHours: e.target.value
                ? Number(e.target.value)
                : undefined,
            })
          }
          className="rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold text-text-secondary">
          Expiry action (optional)
        </label>
        <input
          type="text"
          value={config.expiryAction ?? ""}
          onChange={(e) =>
            onChange({
              ...config,
              expiryAction: e.target.value || undefined,
            })
          }
          placeholder="e.g. auto-block"
          className="rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const reviewActionPlugin: BlockPlugin<ReviewActionConfig> = {
  type: "action:review",
  category: "action",
  label: "Request Review",
  icon: ReviewIcon,
  defaultConfig,
  schema,
  Renderer,
  PropertyEditor,
};
