"use client";

import { useState } from "react";
import type { RemediationItem, EvidenceAttachment } from "@/lib/types";
import { PRIORITY_STYLES, STATUS_STYLES, STATUS_LABELS, isOverdue } from "./remediation-card";
import { EvidenceUpload } from "./evidence-upload";
import { AutoFixButton } from "./auto-fix-button";

interface RemediationDetailPanelProps {
  item: RemediationItem;
  onStatusChange: (id: string, status: string) => Promise<void>;
  onAssign: (id: string, assignedTo: string) => Promise<void>;
  onLinkExternal: (id: string, provider: string, externalRef: string) => Promise<void>;
  onDownloadEvidence?: (evidenceId: string) => Promise<string | null>;
  isSubmitting: boolean;
  initialEvidence?: EvidenceAttachment[];
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "accepted_risk"],
  in_progress: ["completed", "open"],
  completed: [],
  accepted_risk: ["open"],
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function RemediationDetailPanel({
  item,
  onStatusChange,
  onAssign,
  onLinkExternal,
  onDownloadEvidence,
  isSubmitting,
  initialEvidence = [],
}: RemediationDetailPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [assignTo, setAssignTo] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkProvider, setLinkProvider] = useState("jira");
  const [linkRef, setLinkRef] = useState("");
  const [linking, setLinking] = useState(false);

  const priorityStyle = PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.medium;
  const statusStyle = STATUS_STYLES[item.status] ?? STATUS_STYLES.open;
  const overdue = isOverdue(item);
  const availableTransitions = STATUS_TRANSITIONS[item.status] ?? [];

  const handleStatusChange = async (newStatus: string) => {
    setError(null);
    try {
      await onStatusChange(item.id, newStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const handleAssign = async () => {
    if (!assignTo.trim()) return;
    setAssigning(true);
    setError(null);
    try {
      await onAssign(item.id, assignTo.trim());
      setShowAssign(false);
      setAssignTo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign");
    } finally {
      setAssigning(false);
    }
  };

  const handleLink = async () => {
    if (!linkRef.trim()) return;
    setLinking(true);
    setError(null);
    try {
      await onLinkExternal(item.id, linkProvider, linkRef.trim());
      setShowLink(false);
      setLinkRef("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link");
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary">Remediation Detail</h2>
        <div className="mt-3 rounded-xl border border-border bg-surface-1 p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[14px] font-bold text-text-primary leading-snug">
              {item.title}
            </h3>
            <span className="font-mono text-[12px] font-bold text-text-secondary">
              {item.priorityScore}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${statusStyle.bg} ${statusStyle.text} border-current/30`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
              {STATUS_LABELS[item.status] ?? item.status}
            </span>
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${priorityStyle.bg} ${priorityStyle.text}`}>
              {item.priority}
            </span>
            {overdue && (
              <span className="rounded-md bg-status-fail/15 px-2 py-0.5 text-[10px] font-semibold text-status-fail">
                OVERDUE
              </span>
            )}
          </div>
          {item.description && (
            <p className="mt-3 text-[12px] leading-relaxed text-text-secondary">
              {item.description}
            </p>
          )}
        </div>
      </div>

      {/* Info Grid */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Details</h2>
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Type</p>
              <p className="mt-1 text-[12px] capitalize text-text-secondary">{item.itemType}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Framework</p>
              <p className="mt-1 text-[12px] font-mono uppercase text-text-secondary">
                {item.frameworkSlug ?? "--"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Control</p>
              <p className="mt-1 text-[12px] font-mono text-text-secondary">
                {item.controlCode ?? "--"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Assigned To</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-[12px] text-text-secondary">
                  {item.assignedTo ?? "Unassigned"}
                </p>
                <button
                  onClick={() => setShowAssign(!showAssign)}
                  className="rounded px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent-subtle transition-colors"
                >
                  {item.assignedTo ? "Reassign" : "Assign"}
                </button>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Created</p>
              <p className="mt-1 text-[12px] text-text-secondary">{formatDate(item.createdAt)}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Due Date</p>
              <p className={`mt-1 text-[12px] ${overdue ? "font-semibold text-status-fail" : "text-text-secondary"}`}>
                {item.dueDate ? formatDate(item.dueDate) : "--"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">External Link</p>
              <div className="mt-1 flex items-center gap-2">
                {item.externalRef ? (
                  <span className="font-mono text-[12px] text-accent">{item.externalRef}</span>
                ) : (
                  <>
                    <span className="text-[12px] text-text-tertiary">None</span>
                    <button
                      onClick={() => setShowLink(!showLink)}
                      className="rounded px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent-subtle transition-colors"
                    >
                      Link
                    </button>
                  </>
                )}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Updated</p>
              <p className="mt-1 text-[12px] text-text-secondary">{formatRelativeTime(item.updatedAt)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Assign Form */}
      {showAssign && (
        <div className="rounded-xl border border-accent/30 bg-accent-subtle/30 p-4">
          <label htmlFor="assign-to" className="block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
            Assign to (team or user)
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="assign-to"
              type="text"
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              placeholder="e.g. security-team"
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              onClick={handleAssign}
              disabled={!assignTo.trim() || assigning}
              className="rounded-lg bg-accent px-4 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {assigning ? "Assigning..." : "Confirm"}
            </button>
            <button
              onClick={() => { setShowAssign(false); setAssignTo(""); }}
              className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-text-secondary hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Link External Form */}
      {showLink && (
        <div className="rounded-xl border border-accent/30 bg-accent-subtle/30 p-4">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
            Link to external tracker
          </label>
          <div className="mt-2 flex gap-2">
            <select
              value={linkProvider}
              onChange={(e) => setLinkProvider(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[13px] text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="jira">Jira</option>
              <option value="github">GitHub</option>
              <option value="linear">Linear</option>
              <option value="asana">Asana</option>
            </select>
            <input
              type="text"
              value={linkRef}
              onChange={(e) => setLinkRef(e.target.value)}
              placeholder="e.g. SEC-234"
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              onClick={handleLink}
              disabled={!linkRef.trim() || linking}
              className="rounded-lg bg-accent px-4 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {linking ? "Linking..." : "Link"}
            </button>
            <button
              onClick={() => { setShowLink(false); setLinkRef(""); }}
              className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-text-secondary hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Children */}
      {(item.children?.length ?? 0) > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">
            Sub-items ({item.children!.length})
          </h2>
          <div className="rounded-xl border border-border bg-surface-1 p-4 space-y-2">
            {item.children!.map((child) => {
              const childStatus = STATUS_STYLES[child.status] ?? STATUS_STYLES.open;
              return (
                <div
                  key={child.id}
                  className="flex items-center gap-3 rounded-lg border border-border/50 p-3"
                >
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${childStatus.dot}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-text-primary truncate">
                      {child.title}
                    </p>
                    <p className="text-[11px] text-text-tertiary">
                      {STATUS_LABELS[child.status] ?? child.status}
                      {child.assignedTo ? ` - ${child.assignedTo}` : ""}
                    </p>
                  </div>
                  {child.completedAt && (
                    <span className="text-[10px] text-text-tertiary">
                      {formatRelativeTime(child.completedAt)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Evidence Notes */}
      {item.evidenceNotes && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Evidence Notes</h2>
          <div className="rounded-xl border border-border bg-surface-1 p-5">
            <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-text-secondary">
              {item.evidenceNotes}
            </p>
          </div>
        </div>
      )}

      {/* Evidence Attachments */}
      <EvidenceUpload
        remediationId={item.id}
        initialEvidence={initialEvidence}
        onDownload={onDownloadEvidence ?? (async () => null)}
      />

      {/* Actions */}
      {(availableTransitions.length > 0 || item.findingId) && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Actions</h2>
          <div className="rounded-xl border border-border bg-surface-1 p-5">
            {error && (
              <p className="mb-3 text-[12px] text-status-fail">{error}</p>
            )}
            {availableTransitions.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {availableTransitions.map((status) => {
                  const style = STATUS_STYLES[status] ?? STATUS_STYLES.open;
                  const label = STATUS_LABELS[status] ?? status;
                  const isComplete = status === "completed";
                  const isAccept = status === "accepted_risk";
                  return (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(status)}
                      disabled={isSubmitting}
                      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        isComplete
                          ? "bg-status-pass/20 text-status-pass border-status-pass/30 hover:bg-status-pass/30"
                          : isAccept
                            ? "bg-surface-3 text-text-secondary border-border hover:bg-surface-3/80"
                            : `${style.bg} ${style.text} border-current/30 hover:opacity-80`
                      }`}
                    >
                      {isSubmitting ? "Updating..." : `Move to ${label}`}
                    </button>
                  );
                })}
              </div>
            )}
            {item.findingId && (
              <div className="mt-3">
                <AutoFixButton item={item} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activity Timeline */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Activity</h2>
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="space-y-3">
            {/* Created event */}
            <div className="flex items-start gap-3">
              <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-accent" />
              <div>
                <p className="text-[12px] text-text-secondary">
                  Created by <span className="font-medium text-text-primary">{item.createdBy}</span>
                </p>
                <p className="text-[10px] text-text-tertiary">{formatDate(item.createdAt)}</p>
              </div>
            </div>
            {/* Assigned event - if assigned */}
            {item.assignedTo && (
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-blue-400" />
                <div>
                  <p className="text-[12px] text-text-secondary">
                    Assigned to <span className="font-medium text-text-primary">{item.assignedTo}</span>
                  </p>
                </div>
              </div>
            )}
            {/* External link - if linked */}
            {item.externalRef && (
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-purple-400" />
                <div>
                  <p className="text-[12px] text-text-secondary">
                    Linked to <span className="font-mono text-[12px] text-accent">{item.externalRef}</span>
                  </p>
                </div>
              </div>
            )}
            {/* Completed - if completed */}
            {item.completedAt && (
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-status-pass" />
                <div>
                  <p className="text-[12px] text-text-secondary">
                    Completed{item.completedBy ? ` by ${item.completedBy}` : ""}
                  </p>
                  <p className="text-[10px] text-text-tertiary">{formatDate(item.completedAt)}</p>
                </div>
              </div>
            )}
            {/* Current status */}
            {item.status !== "open" && item.status !== "completed" && (
              <div className="flex items-start gap-3">
                <div className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${statusStyle.dot}`} />
                <div>
                  <p className="text-[12px] text-text-secondary">
                    Status changed to <span className="font-medium text-text-primary">{STATUS_LABELS[item.status] ?? item.status}</span>
                  </p>
                  <p className="text-[10px] text-text-tertiary">{formatRelativeTime(item.updatedAt)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="text-[11px] text-text-tertiary">
        <span>Created by {item.createdBy}</span>
        {item.completedBy && <span> - Completed by {item.completedBy}</span>}
        <span> - ID: {item.id}</span>
      </div>
    </div>
  );
}
