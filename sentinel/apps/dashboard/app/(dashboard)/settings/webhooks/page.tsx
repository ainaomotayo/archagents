"use client";

import { useState } from "react";
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

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>(MOCK_WEBHOOKS);
  const [showForm, setShowForm] = useState(false);

  const toggleEnabled = (id: string) => {
    setWebhooks((prev) =>
      prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)),
    );
  };

  const deleteWebhook = (id: string) => {
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description="Configure webhook endpoints for SENTINEL events."
        action={
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 focus-ring"
          >
            <IconPlus className="h-4 w-4" />
            {showForm ? "Cancel" : "Add Webhook"}
          </button>
        }
      />

      {/* New webhook form */}
      {showForm && (
        <div className="animate-fade-up rounded-xl border border-border bg-surface-1 p-6 space-y-5">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
              Name
            </label>
            <input
              type="text"
              placeholder="e.g., Slack Notifications"
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
              className="w-full rounded-lg border border-border bg-surface-0 px-4 py-2.5 font-mono text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
              Events
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                "scan.completed",
                "scan.failed",
                "finding.created",
                "certificate.issued",
                "certificate.revoked",
              ].map((event) => (
                <label
                  key={event}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px] text-text-secondary cursor-pointer hover:border-border-accent transition-colors"
                >
                  <input type="checkbox" className="rounded accent-accent" />
                  {event}
                </label>
              ))}
            </div>
          </div>
          <button className="rounded-lg bg-status-pass px-4 py-2.5 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 focus-ring">
            Save Webhook
          </button>
        </div>
      )}

      {/* Webhook list */}
      <div className="space-y-3">
        {webhooks.map((wh, i) => (
          <div
            key={wh.id}
            className="animate-fade-up rounded-xl border border-border bg-surface-1 p-5 transition-all hover:border-border-accent"
            style={{ animationDelay: `${0.05 * i}s` }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-3">
                  <IconGlobe className="h-4 w-4 text-text-tertiary" />
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
                <button
                  onClick={() => deleteWebhook(wh.id)}
                  className="text-[11px] font-medium text-status-fail hover:brightness-110 focus-ring rounded px-2 py-1"
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {wh.events.map((e) => (
                <span
                  key={e}
                  className="rounded-md bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-text-tertiary"
                >
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
              </p>
            )}
          </div>
        ))}

        {webhooks.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-16 text-center">
            <p className="text-[13px] text-text-tertiary">
              No webhooks configured. Click &quot;Add Webhook&quot; to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
