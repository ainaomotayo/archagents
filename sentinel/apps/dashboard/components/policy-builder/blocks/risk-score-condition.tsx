"use client";

import { z } from "zod";
import type { BlockPlugin, RuleNode } from "./types";

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function RiskScoreIcon({ className }: { className?: string }) {
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
      <circle cx="8" cy="9" r="5.5" />
      <path d="M8 5v4l2.5 1.5" />
      <path d="M6 2h4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface RiskScoreConfig {
  operator: "gt" | "lt" | "between";
  value: number;
  upperBound?: number;
}

const schema = z.object({
  operator: z.enum(["gt", "lt", "between"]),
  value: z.number(),
  upperBound: z.number().optional(),
});

const defaultConfig: RiskScoreConfig = { operator: "gt", value: 50 };

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

const OP_LABELS: Record<string, string> = {
  gt: ">",
  lt: "<",
  between: "",
};

function Renderer({ config }: { node: RuleNode; config: RiskScoreConfig }) {
  let label: string;
  if (config.operator === "between") {
    label = `${config.value}\u2013${config.upperBound ?? "?"}`;
  } else {
    label = `${OP_LABELS[config.operator]} ${config.value}`;
  }
  return (
    <span className="text-[13px] text-text-primary">
      <span className="font-semibold">Risk Score</span> {label}
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
  config: RiskScoreConfig;
  onChange: (c: RiskScoreConfig) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold text-text-secondary">
          Operator
        </label>
        <select
          value={config.operator}
          onChange={(e) =>
            onChange({
              ...config,
              operator: e.target.value as RiskScoreConfig["operator"],
            })
          }
          className="rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-[13px] text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="gt">Greater than</option>
          <option value="lt">Less than</option>
          <option value="between">Between</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold text-text-secondary">
          {config.operator === "between" ? "Lower bound" : "Value"}
        </label>
        <input
          type="number"
          value={config.value}
          onChange={(e) =>
            onChange({ ...config, value: Number(e.target.value) })
          }
          className="rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-[13px] text-text-primary focus:border-accent focus:outline-none"
        />
      </div>

      {config.operator === "between" && (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-text-secondary">
            Upper bound
          </label>
          <input
            type="number"
            value={config.upperBound ?? ""}
            onChange={(e) =>
              onChange({
                ...config,
                upperBound: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-[13px] text-text-primary focus:border-accent focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const riskScoreConditionPlugin: BlockPlugin<RiskScoreConfig> = {
  type: "condition:risk-score",
  category: "condition",
  label: "Risk Score",
  icon: RiskScoreIcon,
  defaultConfig,
  schema,
  Renderer,
  PropertyEditor,
};
