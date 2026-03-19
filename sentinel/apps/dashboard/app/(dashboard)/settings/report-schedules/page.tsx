"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import {
  IconCalendarEvent,
  IconPlus,
  IconTrash,
  IconEdit,
  IconPlayerPlay,
  IconCheck,
  IconX,
} from "@/components/icons";

const API_BASE = "/api";

/* ─── Types ─── */
interface ReportSchedule {
  id: string;
  name: string;
  reportType: string;
  cronExpr: string;
  timezone: string;
  recipients: string[];
  enabled: boolean;
  lastStatus: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const REPORT_TYPES = [
  { value: "compliance_summary", label: "Compliance Summary" },
  { value: "executive", label: "Executive" },
  { value: "nist_profile", label: "NIST Profile" },
  { value: "hipaa_assessment", label: "HIPAA Assessment" },
  { value: "audit_evidence", label: "Audit Evidence" },
  { value: "digest", label: "Digest" },
] as const;

const CRON_PRESETS = [
  { label: "Weekly Monday 8 AM", value: "0 8 * * 1" },
  { label: "Weekly Friday 8 AM", value: "0 8 * * 5" },
  { label: "Monthly 1st 8 AM", value: "0 8 1 * *" },
  { label: "Custom", value: "__custom__" },
] as const;

/* ─── Helpers ─── */
function cronToHuman(cron: string): string {
  const preset = CRON_PRESETS.find((p) => p.value === cron);
  if (preset) return preset.label;

  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;
  const [min, hour, dom, , dow] = parts;

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let dayPart = "";
  if (dom !== "*") dayPart = `day ${dom}`;
  else if (dow !== "*") dayPart = dayNames[Number(dow)] ?? dow;
  else dayPart = "daily";

  return `${dayPart} at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
}

function statusColor(status: string | null): string {
  if (!status) return "bg-surface-3 text-text-tertiary border-border";
  if (status === "delivered" || status === "triggered")
    return "bg-status-pass/15 text-status-pass border-status-pass/30";
  if (status === "failed")
    return "bg-status-fail/15 text-status-fail border-status-fail/30";
  return "bg-surface-3 text-text-tertiary border-border";
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ─── Dialog ─── */
function ScheduleDialog({
  schedule,
  onSave,
  onClose,
}: {
  schedule: Partial<ReportSchedule> | null;
  onSave: (data: {
    name: string;
    reportType: string;
    cronExpr: string;
    timezone: string;
    recipients: string[];
    enabled: boolean;
  }) => void;
  onClose: () => void;
}) {
  const isEdit = schedule?.id != null;
  const [name, setName] = useState(schedule?.name ?? "");
  const [reportType, setReportType] = useState(
    schedule?.reportType ?? "compliance_summary",
  );
  const [cronPreset, setCronPreset] = useState<string>(() => {
    const found = CRON_PRESETS.find((p) => p.value === schedule?.cronExpr);
    return found ? found.value : "__custom__";
  });
  const [customCron, setCustomCron] = useState(schedule?.cronExpr ?? "");
  const [timezone, setTimezone] = useState(
    schedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [recipientsText, setRecipientsText] = useState(
    (schedule?.recipients ?? []).join(", "),
  );
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    const cron = cronPreset === "__custom__" ? customCron.trim() : cronPreset;
    if (!cron) {
      setError("Cron expression is required.");
      return;
    }
    const recipients = recipientsText
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    if (recipients.length === 0) {
      setError("At least one recipient is required.");
      return;
    }
    setError(null);
    onSave({ name: name.trim(), reportType, cronExpr: cron, timezone, recipients, enabled });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="animate-fade-up w-full max-w-lg rounded-xl border border-border bg-surface-1 p-6 shadow-xl space-y-5"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-1 rounded-full bg-accent" />
          <h2 className="text-[15px] font-semibold text-text-primary">
            {isEdit ? "Edit Schedule" : "New Schedule"}
          </h2>
        </div>

        {error && (
          <div className="rounded-lg border border-status-fail/30 bg-status-fail/10 px-4 py-2.5 text-[13px] font-medium text-status-fail">
            {error}
          </div>
        )}

        {/* Name */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Weekly Compliance Summary"
            className="w-full rounded-lg border border-border bg-surface-0 px-4 py-2.5 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* Report Type */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
            Report Type
          </label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-0 px-4 py-2.5 text-[13px] text-text-primary outline-none focus:border-accent transition-colors"
          >
            {REPORT_TYPES.map((rt) => (
              <option key={rt.value} value={rt.value}>
                {rt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Cron Schedule */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
            Schedule
          </label>
          <select
            value={cronPreset}
            onChange={(e) => {
              setCronPreset(e.target.value);
              if (e.target.value !== "__custom__") setCustomCron(e.target.value);
            }}
            className="w-full rounded-lg border border-border bg-surface-0 px-4 py-2.5 text-[13px] text-text-primary outline-none focus:border-accent transition-colors"
          >
            {CRON_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {cronPreset === "__custom__" && (
            <input
              type="text"
              value={customCron}
              onChange={(e) => setCustomCron(e.target.value)}
              placeholder="e.g., 0 9 * * 1-5"
              className="mt-2 w-full rounded-lg border border-border bg-surface-0 px-4 py-2.5 font-mono text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
            />
          )}
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
            Timezone
          </label>
          <input
            type="text"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="America/New_York"
            className="w-full rounded-lg border border-border bg-surface-0 px-4 py-2.5 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* Recipients */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
            Recipients (comma-separated)
          </label>
          <input
            type="text"
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            placeholder="alice@acme.com, bob@acme.com"
            className="w-full rounded-lg border border-border bg-surface-0 px-4 py-2.5 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* Enabled */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded accent-accent h-4 w-4"
          />
          <span className="text-[13px] text-text-primary">Enabled</span>
        </label>

        {/* Actions */}
        <div className="flex items-center gap-3 border-t border-border pt-5">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 active:scale-[0.98] focus-ring"
          >
            <IconCheck className="h-4 w-4" />
            {isEdit ? "Update" : "Create"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2.5 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── Delete Confirmation Dialog ─── */
function DeleteDialog({
  scheduleName,
  onConfirm,
  onCancel,
}: {
  scheduleName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="animate-fade-up w-full max-w-sm rounded-xl border border-border bg-surface-1 p-6 shadow-xl space-y-4">
        <h2 className="text-[15px] font-semibold text-text-primary">
          Delete Schedule
        </h2>
        <p className="text-[13px] text-text-secondary">
          Are you sure you want to delete <strong>{scheduleName}</strong>? This
          action cannot be undone.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-lg bg-status-fail px-4 py-2.5 text-[13px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98] focus-ring"
          >
            <IconTrash className="h-4 w-4" />
            Delete
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2.5 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function ReportSchedulesPage() {
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [dialogSchedule, setDialogSchedule] = useState<
    Partial<ReportSchedule> | null | undefined
  >(undefined); // undefined = closed, null = new, object = edit
  const [deleteTarget, setDeleteTarget] = useState<ReportSchedule | null>(null);

  const showFeedback = useCallback(
    (type: "success" | "error", message: string) => {
      setFeedback({ type, message });
      setTimeout(() => setFeedback(null), 4000);
    },
    [],
  );

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/report-schedules`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSchedules(data.data ?? data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch schedules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  async function handleSave(data: {
    name: string;
    reportType: string;
    cronExpr: string;
    timezone: string;
    recipients: string[];
    enabled: boolean;
  }) {
    const isEdit = dialogSchedule?.id != null;
    const url = isEdit
      ? `${API_BASE}/report-schedules/${dialogSchedule!.id}`
      : `${API_BASE}/report-schedules`;
    const method = isEdit ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDialogSchedule(undefined);
      showFeedback("success", isEdit ? "Schedule updated." : "Schedule created.");
      fetchSchedules();
    } catch (err) {
      showFeedback(
        "error",
        err instanceof Error ? err.message : "Failed to save schedule",
      );
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const res = await fetch(
        `${API_BASE}/report-schedules/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDeleteTarget(null);
      showFeedback("success", `Deleted "${deleteTarget.name}".`);
      fetchSchedules();
    } catch (err) {
      showFeedback(
        "error",
        err instanceof Error ? err.message : "Failed to delete schedule",
      );
    }
  }

  async function handleToggle(schedule: ReportSchedule) {
    try {
      const res = await fetch(
        `${API_BASE}/report-schedules/${schedule.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !schedule.enabled }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchSchedules();
    } catch (err) {
      showFeedback(
        "error",
        err instanceof Error ? err.message : "Failed to toggle schedule",
      );
    }
  }

  async function handleRunNow(schedule: ReportSchedule) {
    try {
      const res = await fetch(
        `${API_BASE}/report-schedules/${schedule.id}/trigger`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showFeedback("success", `Triggered "${schedule.name}".`);
      fetchSchedules();
    } catch (err) {
      showFeedback(
        "error",
        err instanceof Error ? err.message : "Failed to trigger schedule",
      );
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report Schedules"
        description="Manage automated report delivery schedules."
        action={
          <button
            onClick={() => setDialogSchedule(null)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 active:scale-[0.98] focus-ring"
          >
            <IconPlus className="h-4 w-4" />
            New Schedule
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

      {/* Loading state */}
      {loading && (
        <div className="rounded-xl border border-border bg-surface-1 px-6 py-16 text-center">
          <p className="text-[13px] text-text-tertiary">Loading schedules...</p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-xl border border-status-fail/30 bg-status-fail/10 px-6 py-16 text-center">
          <p className="text-[13px] text-status-fail">{error}</p>
          <button
            onClick={fetchSchedules}
            className="mt-3 text-[12px] font-medium text-accent hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && !error && schedules.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface-1">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3 text-center">Recipients</th>
                <th className="px-4 py-3">Next Run</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Enabled</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s, i) => (
                <tr
                  key={s.id}
                  className="animate-fade-up border-b border-border last:border-0 transition-colors hover:bg-surface-2/50"
                  style={{ animationDelay: `${0.03 * i}s` }}
                >
                  <td className="px-4 py-3">
                    <span className="text-[13px] font-medium text-text-primary">
                      {s.name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                      {REPORT_TYPES.find((rt) => rt.value === s.reportType)?.label ??
                        s.reportType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-text-secondary">
                    {cronToHuman(s.cronExpr)}
                  </td>
                  <td className="px-4 py-3 text-center text-[12px] text-text-secondary">
                    {s.recipients.length}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-text-secondary">
                    {formatDateTime(s.nextRunAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusColor(s.lastStatus)}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          s.lastStatus === "delivered" || s.lastStatus === "triggered"
                            ? "bg-status-pass"
                            : s.lastStatus === "failed"
                              ? "bg-status-fail"
                              : "bg-text-tertiary"
                        }`}
                      />
                      {s.lastStatus ?? "never"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggle(s)}
                      className={`relative inline-block h-5 w-9 rounded-full transition-colors ${
                        s.enabled ? "bg-accent" : "bg-surface-3"
                      }`}
                      role="switch"
                      aria-checked={s.enabled}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          s.enabled ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleRunNow(s)}
                        title="Run Now"
                        className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-accent/10 hover:text-accent"
                      >
                        <IconPlayerPlay className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDialogSchedule(s)}
                        title="Edit"
                        className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-accent/10 hover:text-accent"
                      >
                        <IconEdit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(s)}
                        title="Delete"
                        className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-status-fail/10 hover:text-status-fail"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && schedules.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-16 text-center">
          <div className="flex justify-center mb-3">
            <IconCalendarEvent className="h-8 w-8 text-text-tertiary/50" />
          </div>
          <p className="text-[13px] text-text-tertiary">
            No report schedules configured. Click &quot;New Schedule&quot; to get
            started.
          </p>
        </div>
      )}

      {/* Create/Edit dialog */}
      {dialogSchedule !== undefined && (
        <ScheduleDialog
          schedule={dialogSchedule}
          onSave={handleSave}
          onClose={() => setDialogSchedule(undefined)}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <DeleteDialog
          scheduleName={deleteTarget.name}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
