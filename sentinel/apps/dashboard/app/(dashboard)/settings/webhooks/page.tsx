"use client";

import { useState, useEffect } from "react";
import { MOCK_WEBHOOKS } from "@/lib/mock-data";
import { PageHeader } from "@/components/page-header";
import { IconPlus, IconGlobe } from "@/components/icons";

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  lastTriggered: string | null;
}

const STORAGE_KEY = "sentinel_webhooks";

const ALL_EVENTS = [
  "scan.completed",
  "scan.failed",
  "finding.created",
  "certificate.issued",
  "certificate.revoked",
] as const;

function loadWebhooks(): Webhook[] {
  if (typeof window === "undefined") return MOCK_WEBHOOKS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore parse errors
  }
  return MOCK_WEBHOOKS;
}

function saveWebhooks(webhooks: Webhook[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(webhooks));
  } catch {
    // ignore storage errors
  }
}

function getRelativeTime(dateString: string): string {
  const now = new Date();
  const then = new Date(dateString);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>(MOCK_WEBHOOKS);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    setWebhooks(loadWebhooks());
  }, []);

  // Persist whenever webhooks change (skip initial render with loaded data)
  const updateWebhooks = (next: Webhook[]) => {
    setWebhooks(next);
    saveWebhooks(next);
  };

  const toggleEnabled = (id: string) => {
    const next = webhooks.map((w) =>
      w.id === id ? { ...w, enabled: !w.enabled } : w,
    );
    updateWebhooks(next);
  };

  const deleteWebhook = (id: string) => {
    const next = webhooks.filter((w) => w.id !== id);
    updateWebhooks(next);
  };

  const toggleFormEvent = (event: string) => {
    setFormEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  const resetForm = () => {
    setFormName("");
    setFormUrl("");
    setFormEvents([]);
  };

  const handleSave = () => {
    if (!formName.trim()) {
      setFeedback({ type: "error", message: "Webhook name is required." });
      return;
    }
    if (!formUrl.trim()) {
      setFeedback({ type: "error", message: "Webhook URL is required." });
      return;
    }
    try {
      new URL(formUrl);
    } catch {
      setFeedback({ type: "error", message: "Please enter a valid URL." });
      return;
    }
    if (formEvents.length === 0) {
      setFeedback({ type: "error", message: "Select at least one event." });
      return;
    }

    const newWebhook: Webhook = {
      id: `wh-${Date.now()}`,
      name: formName.trim(),
      url: formUrl.trim(),
      events: formEvents,
      enabled: true,
      lastTriggered: null,
    };

    updateWebhooks([newWebhook, ...webhooks]);
    resetForm();
    setShowForm(false);
    setFeedback({ type: "success", message: `Webhook "${newWebhook.name}" created successfully.` });
    setTimeout(() => setFeedback(null), 4000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description="Configure webhook endpoints for SENTINEL events."
        action={
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 active:scale-[0.98] focus-ring"
          >
            <IconPlus className="h-4 w-4" />
            {showForm ? "Cancel" : "Add Webhook"}
          </button>
        }
      />

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`animate-fade-up rounded-lg border px-4 py-3 text-[13px] font-medium ${
            feedback.type === "success"
              ? "border-status-pass/30 bg-status-pass/10 text-status-pass"
              : "border-status-fail/30 bg-status-fail/10 text-status-fail"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* New webhook form */}
      {showForm && (
        <div className="animate-fade-up rounded-xl border border-border bg-surface-1 p-6 space-y-5">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="h-5 w-1 rounded-full bg-accent" />
            <h2 className="text-[15px] font-semibold text-text-primary">
              New Webhook
            </h2>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
              Name
            </label>
            <input
              type="text"
              placeholder="e.g., Slack Notifications"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-0 px-4 py-2.5 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
              URL
            </label>
            <input
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-0 px-4 py-2.5 font-mono text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
              Events
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_EVENTS.map((event) => (
                <label
                  key={event}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] text-text-secondary cursor-pointer transition-colors ${
                    formEvents.includes(event)
                      ? "border-accent bg-accent/10"
                      : "border-border bg-surface-2 hover:border-border-accent"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="rounded accent-accent"
                    checked={formEvents.includes(event)}
                    onChange={() => toggleFormEvent(event)}
                  />
                  {event}
                </label>
              ))}
            </div>
          </div>
          <div className="border-t border-border pt-5">
            <button
              onClick={handleSave}
              className="rounded-lg bg-status-pass px-4 py-2.5 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 active:scale-[0.98] focus-ring"
            >
              Save Webhook
            </button>
          </div>
        </div>
      )}

      {/* Webhook list */}
      <div className="space-y-3">
        {webhooks.map((wh, i) => (
          <div
            key={wh.id}
            className="card-shine animate-fade-up rounded-xl border border-border bg-surface-1 p-5 transition-all hover:border-border-accent"
            style={{ animationDelay: `${0.05 * i}s` }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="group/icon flex h-9 w-9 items-center justify-center rounded-lg bg-surface-3 transition-colors hover:bg-accent/15">
                  <IconGlobe className="h-4 w-4 text-text-tertiary transition-colors group-hover/icon:text-accent" />
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold text-text-primary">{wh.name}</h3>
                  <p className="mt-0.5 max-w-md truncate font-mono text-[11px] text-text-tertiary">
                    {wh.url}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleEnabled(wh.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                    wh.enabled
                      ? "bg-status-pass/15 text-status-pass border-status-pass/30"
                      : "bg-surface-3 text-text-tertiary border-border"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${wh.enabled ? "bg-status-pass" : "bg-text-tertiary"}`} />
                  {wh.enabled ? "Active" : "Disabled"}
                </button>
                <div className="rounded-md transition-colors hover:bg-status-fail/10">
                  <button
                    onClick={() => deleteWebhook(wh.id)}
                    className="text-[11px] font-medium text-status-fail hover:brightness-110 focus-ring rounded px-2 py-1"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {wh.events.map((e) => (
                <span
                  key={e}
                  className="inline-flex items-center gap-1.5 rounded-md bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-text-tertiary"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-accent/60" />
                  {e}
                </span>
              ))}
            </div>
            {wh.lastTriggered && (
              <p className="mt-3 text-[11px] text-text-tertiary">
                Last triggered:{" "}
                {new Date(wh.lastTriggered).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                <span className="ml-1.5 text-text-tertiary/70">
                  ({getRelativeTime(wh.lastTriggered)})
                </span>
              </p>
            )}
          </div>
        ))}

        {webhooks.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-16 text-center">
            <div className="flex justify-center mb-3">
              <IconGlobe className="h-8 w-8 text-text-tertiary/50" />
            </div>
            <p className="text-[13px] text-text-tertiary">
              No webhooks configured. Click &quot;Add Webhook&quot; to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
