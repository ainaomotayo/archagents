"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/page-header";
import {
  IconChevronLeft,
  IconShield,
  IconPlus,
  IconTrash,
  IconCheck,
  IconX,
  IconClock,
  IconActivity,
  IconBarChart,
} from "@/components/icons";

/* ─── Dynamic recharts imports (avoid SSR) ─── */
const ResponsiveContainer = dynamic(
  () => import("recharts").then((m) => m.ResponsiveContainer),
  { ssr: false },
);
const BarChart = dynamic(
  () => import("recharts").then((m) => m.BarChart),
  { ssr: false },
);
const Bar = dynamic(
  () => import("recharts").then((m) => m.Bar),
  { ssr: false },
);
const XAxis = dynamic(
  () => import("recharts").then((m) => m.XAxis),
  { ssr: false },
);
const YAxis = dynamic(
  () => import("recharts").then((m) => m.YAxis),
  { ssr: false },
);
const Tooltip = dynamic(
  () => import("recharts").then((m) => m.Tooltip),
  { ssr: false },
);
const Legend = dynamic(
  () => import("recharts").then((m) => m.Legend),
  { ssr: false },
);
const LineChart = dynamic(
  () => import("recharts").then((m) => m.LineChart),
  { ssr: false },
);
const Line = dynamic(
  () => import("recharts").then((m) => m.Line),
  { ssr: false },
);
const CartesianGrid = dynamic(
  () => import("recharts").then((m) => m.CartesianGrid),
  { ssr: false },
);

const API_BASE = "/api";

/* ─── Severity colors ─── */
const SEVERITY_CHART_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#6b7280",
};

const SEVERITIES = ["critical", "high", "medium", "low"] as const;

/* ─── Types ─── */
interface RetentionPolicy {
  id: string;
  orgId: string;
  preset: string;
  tiers: Record<string, number>;
  activeFrom: string;
  createdAt: string;
  updatedAt: string;
}

interface PolicyChange {
  id: string;
  orgId: string;
  status: "pending" | "approved" | "rejected";
  proposedPreset: string;
  proposedTiers: Record<string, number>;
  requestedBy: string;
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

interface ArchiveDestination {
  id: string;
  orgId: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface VolumeStat {
  bucket: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface TrendStat {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface Execution {
  id: string;
  status: "completed" | "failed" | "archiving" | "deleting" | "pending";
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  archivedCount: number;
  deletedCount: number;
  breakdown?: Record<string, { archived: number; deleted: number }>;
  error?: string;
}

/* ─── Presets ─── */
const PRESETS = [
  { value: "minimal", label: "Minimal", desc: "30 / 30 / 14 / 7 days" },
  { value: "standard", label: "Standard", desc: "365 / 180 / 90 / 30 days" },
  { value: "compliance", label: "Compliance", desc: "2555 / 2555 / 730 / 365 days" },
  { value: "custom", label: "Custom", desc: "Set your own tier values" },
] as const;

const PRESET_TIERS: Record<string, Record<string, number>> = {
  minimal: { critical: 30, high: 30, medium: 14, low: 7 },
  standard: { critical: 365, high: 180, medium: 90, low: 30 },
  compliance: { critical: 2555, high: 2555, medium: 730, low: 365 },
};

/* ─── Helpers ─── */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return "\u2014";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function executionStatusClasses(status: string): string {
  switch (status) {
    case "completed":
      return "bg-status-pass/15 text-status-pass border-status-pass/30";
    case "failed":
      return "bg-status-fail/15 text-status-fail border-status-fail/30";
    case "archiving":
    case "deleting":
      return "bg-accent/15 text-accent border-accent/30";
    default:
      return "bg-surface-3 text-text-tertiary border-border";
  }
}

function executionDotClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-status-pass";
    case "failed":
      return "bg-status-fail";
    case "archiving":
    case "deleting":
      return "bg-accent";
    default:
      return "bg-text-tertiary";
  }
}

/* ─── Section 1: Current Policy Card ─── */
function CurrentPolicyCard({
  policy,
  pendingChange,
  onRequestChange,
  onApprove,
  onReject,
}: {
  policy: RetentionPolicy | null;
  pendingChange: PolicyChange | null;
  onRequestChange: (preset: string, tiers: Record<string, number>) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState("standard");
  const [customTiers, setCustomTiers] = useState<Record<string, number>>({
    critical: 365,
    high: 180,
    medium: 90,
    low: 30,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tiers =
      selectedPreset === "custom"
        ? customTiers
        : PRESET_TIERS[selectedPreset] ?? customTiers;
    onRequestChange(selectedPreset, tiers);
    setShowForm(false);
  }

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <IconShield className="h-5 w-5 text-accent" />
          <h2 className="text-[15px] font-semibold text-text-primary">
            Current Policy
          </h2>
          {policy && (
            <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
              {policy.preset}
            </span>
          )}
        </div>
        {!showForm && !pendingChange && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 active:scale-[0.98]"
          >
            Request Change
          </button>
        )}
      </div>

      {/* Severity tier columns */}
      {policy && (
        <div className="grid grid-cols-4 gap-3">
          {SEVERITIES.map((sev) => (
            <div
              key={sev}
              className="rounded-lg border border-border bg-surface-0 p-4 text-center"
            >
              <div
                className="mx-auto mb-2 h-2 w-2 rounded-full"
                style={{ backgroundColor: SEVERITY_CHART_COLORS[sev] }}
              />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                {sev}
              </p>
              <p className="mt-1 text-xl font-bold text-text-primary">
                {policy.tiers[sev] ?? "\u2014"}
              </p>
              <p className="text-[11px] text-text-tertiary">days</p>
            </div>
          ))}
        </div>
      )}

      {!policy && (
        <p className="text-[13px] text-text-tertiary">
          No retention policy configured yet.
        </p>
      )}

      {/* Pending change banner */}
      {pendingChange && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-yellow-500" />
            <p className="text-[13px] font-semibold text-yellow-600">
              Pending Change Request
            </p>
          </div>
          <p className="text-[12px] text-text-secondary">
            Proposed preset:{" "}
            <strong className="text-text-primary">
              {pendingChange.proposedPreset}
            </strong>{" "}
            \u2014 Critical: {pendingChange.proposedTiers.critical}d, High:{" "}
            {pendingChange.proposedTiers.high}d, Medium:{" "}
            {pendingChange.proposedTiers.medium}d, Low:{" "}
            {pendingChange.proposedTiers.low}d
          </p>
          <p className="text-[11px] text-text-tertiary">
            Requested by {pendingChange.requestedBy} on{" "}
            {formatDateTime(pendingChange.requestedAt)}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onApprove(pendingChange.id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-status-pass px-3 py-1.5 text-[12px] font-semibold text-white transition-all hover:brightness-110"
            >
              <IconCheck className="h-3.5 w-3.5" />
              Approve
            </button>
            <button
              onClick={() => onReject(pendingChange.id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-status-fail px-3 py-1.5 text-[12px] font-semibold text-white transition-all hover:brightness-110"
            >
              <IconX className="h-3.5 w-3.5" />
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Request change form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-border bg-surface-0 p-5 space-y-4"
        >
          <p className="text-[13px] font-semibold text-text-primary">
            Request Policy Change
          </p>

          <div className="space-y-2">
            {PRESETS.map((p) => (
              <label
                key={p.value}
                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  selectedPreset === p.value
                    ? "border-accent bg-accent/5"
                    : "border-border hover:bg-surface-2/50"
                }`}
              >
                <input
                  type="radio"
                  name="preset"
                  value={p.value}
                  checked={selectedPreset === p.value}
                  onChange={() => setSelectedPreset(p.value)}
                  className="accent-accent h-4 w-4"
                />
                <div>
                  <span className="text-[13px] font-medium text-text-primary">
                    {p.label}
                  </span>
                  <span className="ml-2 text-[11px] text-text-tertiary">
                    {p.desc}
                  </span>
                </div>
              </label>
            ))}
          </div>

          {selectedPreset === "custom" && (
            <div className="grid grid-cols-4 gap-3">
              {SEVERITIES.map((sev) => (
                <div key={sev}>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">
                    {sev}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={customTiers[sev] ?? 30}
                    onChange={(e) =>
                      setCustomTiers((prev) => ({
                        ...prev,
                        [sev]: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-lg border border-border bg-surface-0 px-3 py-2 text-[13px] text-text-primary outline-none focus:border-accent transition-colors"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 border-t border-border pt-4">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 active:scale-[0.98]"
            >
              <IconCheck className="h-4 w-4" />
              Submit Request
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ─── Section 2: Archive Destinations Card ─── */
function ArchiveDestinationsCard({
  destinations,
  onAdd,
  onToggle,
  onDelete,
  onTest,
}: {
  destinations: ArchiveDestination[];
  onAdd: (data: { type: string; name: string; config: Record<string, unknown> }) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [newType, setNewType] = useState("s3");
  const [newName, setNewName] = useState("");
  const [newConfig, setNewConfig] = useState("{}");
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; error?: string } | "loading">
  >({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) {
      setFormError("Name is required.");
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(newConfig);
    } catch {
      setFormError("Config must be valid JSON.");
      return;
    }
    setFormError(null);
    onAdd({ type: newType, name: newName.trim(), config: parsed });
    setShowForm(false);
    setNewType("s3");
    setNewName("");
    setNewConfig("{}");
  }

  async function handleTest(id: string) {
    setTestResults((prev) => ({ ...prev, [id]: "loading" }));
    const result = await onTest(id);
    setTestResults((prev) => ({ ...prev, [id]: result }));
    setTimeout(() => {
      setTestResults((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 5000);
  }

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <IconActivity className="h-5 w-5 text-accent" />
          <h2 className="text-[15px] font-semibold text-text-primary">
            Archive Destinations
          </h2>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <IconPlus className="h-4 w-4" />
            Add Destination
          </button>
        )}
      </div>

      {/* Destination list */}
      {destinations.length > 0 ? (
        <div className="space-y-2">
          {destinations.map((dest) => (
            <div
              key={dest.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface-0 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="rounded-md bg-surface-3 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                  {dest.type}
                </span>
                <span className="text-[13px] font-medium text-text-primary">
                  {dest.name}
                </span>
                <span
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    dest.enabled
                      ? "border-status-pass/30 bg-status-pass/15 text-status-pass"
                      : "border-border bg-surface-3 text-text-tertiary"
                  }`}
                >
                  {dest.enabled ? "enabled" : "disabled"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Test result inline */}
                {testResults[dest.id] && testResults[dest.id] !== "loading" && (
                  <span
                    className={`text-[11px] font-medium ${
                      (testResults[dest.id] as { ok: boolean }).ok
                        ? "text-status-pass"
                        : "text-status-fail"
                    }`}
                  >
                    {(testResults[dest.id] as { ok: boolean }).ok
                      ? "Connected"
                      : (testResults[dest.id] as { error?: string }).error ??
                        "Failed"}
                  </span>
                )}
                <button
                  onClick={() => handleTest(dest.id)}
                  disabled={testResults[dest.id] === "loading"}
                  className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50"
                >
                  {testResults[dest.id] === "loading" ? "Testing..." : "Test"}
                </button>
                {/* Toggle */}
                <button
                  onClick={() => onToggle(dest.id, !dest.enabled)}
                  className={`relative inline-block h-5 w-9 rounded-full transition-colors ${
                    dest.enabled ? "bg-accent" : "bg-surface-3"
                  }`}
                  role="switch"
                  aria-checked={dest.enabled}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      dest.enabled ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <button
                  onClick={() => onDelete(dest.id)}
                  title="Delete"
                  className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-status-fail/10 hover:text-status-fail"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !showForm && (
          <p className="text-[13px] text-text-tertiary">
            No archive destinations configured.
          </p>
        )
      )}

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleAdd}
          className="rounded-lg border border-border bg-surface-0 p-5 space-y-4"
        >
          <p className="text-[13px] font-semibold text-text-primary">
            New Archive Destination
          </p>

          {formError && (
            <div className="rounded-lg border border-status-fail/30 bg-status-fail/10 px-4 py-2 text-[13px] font-medium text-status-fail">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">
              Type
            </label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-0 px-4 py-2.5 text-[13px] text-text-primary outline-none focus:border-accent transition-colors"
            >
              <option value="s3">S3</option>
              <option value="gcs">GCS</option>
              <option value="azure_blob">Azure Blob</option>
              <option value="sftp">SFTP</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">
              Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g., Production S3 Bucket"
              className="w-full rounded-lg border border-border bg-surface-0 px-4 py-2.5 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">
              Configuration (JSON)
            </label>
            <textarea
              value={newConfig}
              onChange={(e) => setNewConfig(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-border bg-surface-0 px-4 py-2.5 font-mono text-[13px] text-text-primary outline-none focus:border-accent transition-colors"
            />
          </div>

          <div className="flex items-center gap-3 border-t border-border pt-4">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 active:scale-[0.98]"
            >
              <IconCheck className="h-4 w-4" />
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setFormError(null);
              }}
              className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ─── Section 3: Retention Dashboard Charts ─── */
function RetentionCharts({
  volumeStats,
  trendStats,
  projectedDeletions,
}: {
  volumeStats: VolumeStat[];
  trendStats: TrendStat[];
  projectedDeletions: { nextRun?: string; estimates: Record<string, number> } | null;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <IconBarChart className="h-5 w-5 text-accent" />
        <h2 className="text-[15px] font-semibold text-text-primary">
          Retention Dashboard
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Volume Breakdown - Stacked Bar */}
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <h3 className="text-[13px] font-semibold text-text-primary mb-4">
            Volume by Age Bucket
          </h3>
          {volumeStats.length > 0 ? (
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #333)" />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fontSize: 11, fill: "var(--text-tertiary, #888)" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--text-tertiary, #888)" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--surface-1, #1a1a1a)",
                      border: "1px solid var(--border, #333)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {SEVERITIES.map((sev) => (
                    <Bar
                      key={sev}
                      dataKey={sev}
                      stackId="a"
                      fill={SEVERITY_CHART_COLORS[sev]}
                      name={sev.charAt(0).toUpperCase() + sev.slice(1)}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-[12px] text-text-tertiary py-8 text-center">
              No volume data available.
            </p>
          )}
        </div>

        {/* Storage Trend - Line Chart */}
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <h3 className="text-[13px] font-semibold text-text-primary mb-4">
            Storage Trend (30 Day)
          </h3>
          {trendStats.length > 0 ? (
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #333)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "var(--text-tertiary, #888)" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--text-tertiary, #888)" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--surface-1, #1a1a1a)",
                      border: "1px solid var(--border, #333)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {SEVERITIES.map((sev) => (
                    <Line
                      key={sev}
                      type="monotone"
                      dataKey={sev}
                      stroke={SEVERITY_CHART_COLORS[sev]}
                      strokeWidth={2}
                      dot={false}
                      name={sev.charAt(0).toUpperCase() + sev.slice(1)}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-[12px] text-text-tertiary py-8 text-center">
              No trend data available.
            </p>
          )}
        </div>
      </div>

      {/* Projected Deletions */}
      {projectedDeletions && (
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <h3 className="text-[13px] font-semibold text-text-primary mb-3">
            Projected Deletions
          </h3>
          {projectedDeletions.nextRun && (
            <p className="text-[12px] text-text-secondary mb-3">
              Next scheduled run:{" "}
              <span className="font-medium text-text-primary">
                {formatDateTime(projectedDeletions.nextRun)}
              </span>
            </p>
          )}
          <div className="grid grid-cols-4 gap-3">
            {SEVERITIES.map((sev) => (
              <div
                key={sev}
                className="rounded-lg border border-border bg-surface-0 p-3 text-center"
              >
                <div
                  className="mx-auto mb-1.5 h-2 w-2 rounded-full"
                  style={{ backgroundColor: SEVERITY_CHART_COLORS[sev] }}
                />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                  {sev}
                </p>
                <p className="mt-1 text-lg font-bold text-text-primary">
                  {projectedDeletions.estimates[sev] ?? 0}
                </p>
                <p className="text-[11px] text-text-tertiary">records</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Section 4: Execution History Table ─── */
function ExecutionHistoryTable({
  executions,
}: {
  executions: Execution[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <IconClock className="h-5 w-5 text-accent" />
        <h2 className="text-[15px] font-semibold text-text-primary">
          Execution History
        </h2>
      </div>

      {executions.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                <th className="px-4 py-3 w-8" />
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3 text-right">Archived</th>
                <th className="px-4 py-3 text-right">Deleted</th>
              </tr>
            </thead>
            <tbody>
              {executions.map((exec, i) => (
                <>
                  <tr
                    key={exec.id}
                    onClick={() =>
                      setExpandedId(expandedId === exec.id ? null : exec.id)
                    }
                    className="animate-fade-up border-b border-border last:border-0 transition-colors hover:bg-surface-2/50 cursor-pointer"
                    style={{ animationDelay: `${0.03 * i}s` }}
                  >
                    <td className="px-4 py-3 text-text-tertiary">
                      <svg
                        className={`h-3.5 w-3.5 transition-transform ${
                          expandedId === exec.id ? "rotate-90" : ""
                        }`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${executionStatusClasses(exec.status)}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${executionDotClass(exec.status)}`}
                        />
                        {exec.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-text-secondary">
                      {formatDateTime(exec.startedAt)}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-text-secondary">
                      {formatDuration(exec.durationMs)}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-text-secondary text-right">
                      {exec.archivedCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-text-secondary text-right">
                      {exec.deletedCount.toLocaleString()}
                    </td>
                  </tr>
                  {expandedId === exec.id && (
                    <tr key={`${exec.id}-detail`} className="border-b border-border last:border-0">
                      <td colSpan={6} className="px-4 py-4 bg-surface-0">
                        <div className="space-y-3">
                          {exec.breakdown &&
                            Object.entries(exec.breakdown).length > 0 && (
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
                                  Breakdown by Data Type
                                </p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                  {Object.entries(exec.breakdown).map(
                                    ([type, counts]) => (
                                      <div
                                        key={type}
                                        className="rounded-lg border border-border bg-surface-1 p-3"
                                      >
                                        <p className="text-[12px] font-medium text-text-primary capitalize">
                                          {type}
                                        </p>
                                        <p className="text-[11px] text-text-tertiary">
                                          Archived: {counts.archived} | Deleted:{" "}
                                          {counts.deleted}
                                        </p>
                                      </div>
                                    ),
                                  )}
                                </div>
                              </div>
                            )}
                          {exec.error && (
                            <div className="rounded-lg border border-status-fail/30 bg-status-fail/10 px-4 py-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-status-fail mb-1">
                                Error
                              </p>
                              <p className="text-[12px] text-status-fail font-mono">
                                {exec.error}
                              </p>
                            </div>
                          )}
                          {!exec.breakdown &&
                            !exec.error && (
                              <p className="text-[12px] text-text-tertiary">
                                No additional details available.
                              </p>
                            )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[13px] text-text-tertiary">
          No execution history available.
        </p>
      )}
    </div>
  );
}

/* ─── Main Page ─── */
export default function RetentionSettingsPage() {
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null);
  const [pendingChange, setPendingChange] = useState<PolicyChange | null>(null);
  const [destinations, setDestinations] = useState<ArchiveDestination[]>([]);
  const [volumeStats, setVolumeStats] = useState<VolumeStat[]>([]);
  const [trendStats, setTrendStats] = useState<TrendStat[]>([]);
  const [projectedDeletions, setProjectedDeletions] = useState<{
    nextRun?: string;
    estimates: Record<string, number>;
  } | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showFeedback = useCallback(
    (type: "success" | "error", message: string) => {
      setFeedback({ type, message });
      setTimeout(() => setFeedback(null), 4000);
    },
    [],
  );

  const fetchAll = useCallback(async () => {
    try {
      const [
        policyRes,
        changesRes,
        archivesRes,
        statsRes,
        trendRes,
        previewRes,
        execRes,
      ] = await Promise.all([
        fetch(`${API_BASE}/retention/policy`),
        fetch(`${API_BASE}/retention/policy/changes?limit=1`),
        fetch(`${API_BASE}/retention/archives`),
        fetch(`${API_BASE}/retention/stats`),
        fetch(`${API_BASE}/retention/stats/trend`),
        fetch(`${API_BASE}/retention/preview`),
        fetch(`${API_BASE}/retention/executions?limit=10`),
      ]);

      if (policyRes.ok) {
        const d = await policyRes.json();
        setPolicy(d.policy ?? d.data ?? d);
      }
      if (changesRes.ok) {
        const d = await changesRes.json();
        const changes = d.changes ?? d.data ?? [];
        const pending = Array.isArray(changes)
          ? changes.find((c: PolicyChange) => c.status === "pending") ?? null
          : null;
        setPendingChange(pending);
      }
      if (archivesRes.ok) {
        const d = await archivesRes.json();
        setDestinations(d.destinations ?? d.data ?? []);
      }
      if (statsRes.ok) {
        const d = await statsRes.json();
        setVolumeStats(d.stats ?? d.data ?? []);
      }
      if (trendRes.ok) {
        const d = await trendRes.json();
        setTrendStats(d.stats ?? d.data ?? []);
      }
      if (previewRes.ok) {
        const d = await previewRes.json();
        setProjectedDeletions({
          nextRun: d.nextRun,
          estimates: d.estimates ?? {},
        });
      }
      if (execRes.ok) {
        const d = await execRes.json();
        setExecutions(d.executions ?? d.data ?? []);
      }

      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch retention data",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /* ─── Policy change handlers ─── */
  async function handleRequestChange(
    preset: string,
    tiers: Record<string, number>,
  ) {
    try {
      const res = await fetch(`${API_BASE}/retention/policy/changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposedPreset: preset, proposedTiers: tiers }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showFeedback("success", "Change request submitted.");
      fetchAll();
    } catch (err) {
      showFeedback(
        "error",
        err instanceof Error ? err.message : "Failed to submit change",
      );
    }
  }

  async function handleApprove(id: string) {
    try {
      const res = await fetch(
        `${API_BASE}/retention/policy/changes/${id}/approve`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showFeedback("success", "Change approved and applied.");
      fetchAll();
    } catch (err) {
      showFeedback(
        "error",
        err instanceof Error ? err.message : "Failed to approve",
      );
    }
  }

  async function handleReject(id: string) {
    try {
      const res = await fetch(
        `${API_BASE}/retention/policy/changes/${id}/reject`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showFeedback("success", "Change rejected.");
      fetchAll();
    } catch (err) {
      showFeedback(
        "error",
        err instanceof Error ? err.message : "Failed to reject",
      );
    }
  }

  /* ─── Archive handlers ─── */
  async function handleAddDestination(data: {
    type: string;
    name: string;
    config: Record<string, unknown>;
  }) {
    try {
      const res = await fetch(`${API_BASE}/retention/archives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showFeedback("success", "Destination added.");
      fetchAll();
    } catch (err) {
      showFeedback(
        "error",
        err instanceof Error ? err.message : "Failed to add destination",
      );
    }
  }

  async function handleToggleDestination(id: string, enabled: boolean) {
    try {
      const res = await fetch(`${API_BASE}/retention/archives/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchAll();
    } catch (err) {
      showFeedback(
        "error",
        err instanceof Error ? err.message : "Failed to toggle destination",
      );
    }
  }

  async function handleDeleteDestination(id: string) {
    try {
      const res = await fetch(`${API_BASE}/retention/archives/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showFeedback("success", "Destination deleted.");
      fetchAll();
    } catch (err) {
      showFeedback(
        "error",
        err instanceof Error ? err.message : "Failed to delete destination",
      );
    }
  }

  async function handleTestDestination(
    id: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(
        `${API_BASE}/retention/archives/${id}/test`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Test failed",
      };
    }
  }

  return (
    <div className="space-y-6">
      {/* Back link + header */}
      <div className="animate-fade-up">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-[13px] text-text-tertiary hover:text-accent transition-colors rounded"
        >
          <IconChevronLeft className="h-3.5 w-3.5" />
          Settings
        </Link>
      </div>

      <PageHeader
        title="Data Retention"
        description="Configure retention policies, archive destinations, and monitor data lifecycle."
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

      {/* Loading state */}
      {loading && (
        <div className="rounded-xl border border-border bg-surface-1 px-6 py-16 text-center">
          <p className="text-[13px] text-text-tertiary">
            Loading retention data...
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-xl border border-status-fail/30 bg-status-fail/10 px-6 py-16 text-center">
          <p className="text-[13px] text-status-fail">{error}</p>
          <button
            onClick={fetchAll}
            className="mt-3 text-[12px] font-medium text-accent hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          {/* Section 1: Current Policy */}
          <CurrentPolicyCard
            policy={policy}
            pendingChange={pendingChange}
            onRequestChange={handleRequestChange}
            onApprove={handleApprove}
            onReject={handleReject}
          />

          {/* Section 2: Archive Destinations */}
          <ArchiveDestinationsCard
            destinations={destinations}
            onAdd={handleAddDestination}
            onToggle={handleToggleDestination}
            onDelete={handleDeleteDestination}
            onTest={handleTestDestination}
          />

          {/* Section 3: Charts */}
          <RetentionCharts
            volumeStats={volumeStats}
            trendStats={trendStats}
            projectedDeletions={projectedDeletions}
          />

          {/* Section 4: Execution History */}
          <ExecutionHistoryTable executions={executions} />
        </div>
      )}
    </div>
  );
}
