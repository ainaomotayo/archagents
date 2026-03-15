"use client";

import { useState, useCallback } from "react";
import type { RemediationItem } from "@/lib/types";

interface RemediationCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (item: RemediationItem) => void;
  parentItems: RemediationItem[];
  createAction: (data: {
    title: string;
    description: string;
    priority?: string;
    frameworkSlug?: string;
    controlCode?: string;
    assignedTo?: string;
    dueDate?: string;
    itemType?: string;
    parentId?: string;
    findingId?: string;
  }) => Promise<RemediationItem>;
}

export function RemediationCreateModal({
  open,
  onClose,
  onCreated,
  parentItems,
  createAction,
}: RemediationCreateModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [itemType, setItemType] = useState<"compliance" | "finding">("compliance");
  const [priority, setPriority] = useState("medium");
  const [frameworkSlug, setFrameworkSlug] = useState("");
  const [controlCode, setControlCode] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [parentId, setParentId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setTitle("");
    setDescription("");
    setItemType("compliance");
    setPriority("medium");
    setFrameworkSlug("");
    setControlCode("");
    setAssignedTo("");
    setDueDate("");
    setParentId("");
    setError(null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await createAction({
        title: title.trim(),
        description: description.trim(),
        priority,
        itemType,
        frameworkSlug: frameworkSlug.trim() || undefined,
        controlCode: controlCode.trim() || undefined,
        assignedTo: assignedTo.trim() || undefined,
        dueDate: dueDate || undefined,
        parentId: parentId || undefined,
      });
      onCreated(result);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create item");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      reset();
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface-0 p-6 shadow-xl animate-fade-up">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-text-primary">Create Remediation</h2>
          <button
            onClick={handleClose}
            disabled={submitting}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-2 hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Title */}
          <div>
            <label htmlFor="rem-title" className="block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Title *
            </label>
            <input
              id="rem-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement encryption at rest"
              className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="rem-desc" className="block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Description *
            </label>
            <textarea
              id="rem-desc"
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the remediation task..."
              className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Type + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rem-type" className="block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                Type
              </label>
              <select
                id="rem-type"
                value={itemType}
                onChange={(e) => setItemType(e.target.value as "compliance" | "finding")}
                className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="compliance">Compliance</option>
                <option value="finding">Finding</option>
              </select>
            </div>
            <div>
              <label htmlFor="rem-priority" className="block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                Priority
              </label>
              <select
                id="rem-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {/* Framework + Control */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rem-framework" className="block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                Framework
              </label>
              <input
                id="rem-framework"
                type="text"
                value={frameworkSlug}
                onChange={(e) => setFrameworkSlug(e.target.value)}
                placeholder="e.g. hipaa, soc2"
                className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label htmlFor="rem-control" className="block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                Control Code
              </label>
              <input
                id="rem-control"
                type="text"
                value={controlCode}
                onChange={(e) => setControlCode(e.target.value)}
                placeholder="e.g. CC6.1"
                className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          {/* Assignee + Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rem-assignee" className="block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                Assignee
              </label>
              <input
                id="rem-assignee"
                type="text"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="e.g. security-team"
                className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label htmlFor="rem-due" className="block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                Due Date
              </label>
              <input
                id="rem-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          {/* Parent picker */}
          {parentItems.length > 0 && (
            <div>
              <label htmlFor="rem-parent" className="block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                Parent Item (optional)
              </label>
              <select
                id="rem-parent"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">None (top-level item)</option>
                {parentItems.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-[12px] text-status-fail">{error}</p>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim() || !description.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
