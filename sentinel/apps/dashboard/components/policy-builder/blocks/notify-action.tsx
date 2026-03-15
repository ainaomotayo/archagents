"use client";

import { useState, type KeyboardEvent } from "react";
import { z } from "zod";
import type { BlockPlugin, RuleNode } from "./types";

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function NotifyIcon({ className }: { className?: string }) {
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
      <path d="M4 5a4 4 0 0 1 8 0c0 3 1.5 5 1.5 5H2.5S4 8 4 5z" />
      <path d="M6 12a2 2 0 0 0 4 0" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface NotifyActionConfig {
  channel: "email" | "slack";
  recipients: string[];
}

const schema = z.object({
  channel: z.enum(["email", "slack"]),
  recipients: z.array(z.string()),
});

const defaultConfig: NotifyActionConfig = {
  channel: "email",
  recipients: [],
};

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function Renderer({ config }: { node: RuleNode; config: NotifyActionConfig }) {
  const who =
    config.recipients.length > 0
      ? config.recipients.join(", ")
      : "(no recipients)";
  return (
    <span className="text-[13px] text-text-primary">
      <span className="font-bold">Notify</span> via {config.channel}: {who}
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
  config: NotifyActionConfig;
  onChange: (c: NotifyActionConfig) => void;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const value = input.trim();
    if (value && !config.recipients.includes(value)) {
      onChange({ ...config, recipients: [...config.recipients, value] });
    }
    setInput("");
  };

  const remove = (recipient: string) => {
    onChange({
      ...config,
      recipients: config.recipients.filter((r) => r !== recipient),
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold text-text-secondary">
          Channel
        </label>
        <select
          value={config.channel}
          onChange={(e) =>
            onChange({
              ...config,
              channel: e.target.value as NotifyActionConfig["channel"],
            })
          }
          className="rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-[13px] text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="email">Email</option>
          <option value="slack">Slack</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold text-text-secondary">
          Recipients
        </label>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add recipient and press Enter"
          className="rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {config.recipients.map((r) => (
            <span
              key={r}
              className="inline-flex items-center gap-1 rounded-lg bg-accent/20 border border-accent px-2 py-0.5 text-[13px] font-semibold text-accent"
            >
              {r}
              <button
                type="button"
                onClick={() => remove(r)}
                className="ml-0.5 text-accent hover:text-accent/70"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const notifyActionPlugin: BlockPlugin<NotifyActionConfig> = {
  type: "action:notify",
  category: "action",
  label: "Notify",
  icon: NotifyIcon,
  defaultConfig,
  schema,
  Renderer,
  PropertyEditor,
};
