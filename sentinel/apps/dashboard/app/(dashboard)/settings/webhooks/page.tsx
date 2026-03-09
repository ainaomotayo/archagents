"use client";

import { useState } from "react";
import { MOCK_WEBHOOKS } from "@/lib/mock-data";

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Webhooks</h1>
          <p className="mt-1 text-slate-400">
            Configure webhook endpoints for SENTINEL events.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? "Cancel" : "Add Webhook"}
        </button>
      </div>

      {/* New webhook form */}
      {showForm && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Name
            </label>
            <input
              type="text"
              placeholder="e.g., Slack Notifications"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              URL
            </label>
            <input
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
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
                  className="flex items-center gap-1.5 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300"
                >
                  <input type="checkbox" className="rounded" />
                  {event}
                </label>
              ))}
            </div>
          </div>
          <button className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
            Save Webhook
          </button>
        </div>
      )}

      {/* Webhook list */}
      <div className="space-y-3">
        {webhooks.map((wh) => (
          <div
            key={wh.id}
            className="rounded-lg border border-slate-800 bg-slate-900 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white">{wh.name}</h3>
                <p className="mt-1 text-xs font-mono text-slate-400 truncate max-w-md">
                  {wh.url}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleEnabled(wh.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    wh.enabled
                      ? "bg-green-900/50 text-green-300"
                      : "bg-slate-700 text-slate-400"
                  }`}
                >
                  {wh.enabled ? "Active" : "Disabled"}
                </button>
                <button
                  onClick={() => deleteWebhook(wh.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {wh.events.map((e) => (
                <span
                  key={e}
                  className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400"
                >
                  {e}
                </span>
              ))}
            </div>
            {wh.lastTriggered && (
              <p className="mt-2 text-xs text-slate-500">
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
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/50 px-6 py-12 text-center">
            <p className="text-sm text-slate-500">
              No webhooks configured. Click &quot;Add Webhook&quot; to get
              started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
