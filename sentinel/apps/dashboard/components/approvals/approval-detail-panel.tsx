"use client";

import { useState } from "react";
import Link from "next/link";
import type { ApprovalGate } from "@/lib/types";
import { GATE_TYPE_LABEL, formatTimeRemaining } from "./approval-card";

interface ApprovalDetailPanelProps {
  gate: ApprovalGate;
  onDecision: (gateId: string, decision: "approve" | "reject", justification: string) => Promise<void>;
  isSubmitting: boolean;
}

export function ApprovalDetailPanel({ gate, onDecision, isSubmitting }: ApprovalDetailPanelProps) {
  const [justification, setJustification] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isActionable = gate.status === "pending" || gate.status === "escalated";
  const canSubmit = justification.trim().length >= 10 && !isSubmitting;
  const sla = formatTimeRemaining(gate.expiresAt);

  const handleDecision = async (decision: "approve" | "reject") => {
    setError(null);
    try {
      await onDecision(gate.id, decision, justification.trim());
      setJustification("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit decision");
    }
  };

  // SLA progress bar
  const totalWindow = new Date(gate.expiresAt).getTime() - new Date(gate.requestedAt).getTime();
  const elapsed = Date.now() - new Date(gate.requestedAt).getTime();
  const progress = Math.min(100, Math.max(0, (elapsed / totalWindow) * 100));

  const slaBarColor =
    sla.urgency === "critical" ? "bg-status-fail"
    : sla.urgency === "warn" ? "bg-status-warn"
    : sla.urgency === "expired" ? "bg-text-tertiary"
    : "bg-status-pass";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary">Gate Detail</h2>
        <div className="mt-3 rounded-xl border border-border bg-surface-1 p-5">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Status</p>
              <p className="mt-1 text-[12px] font-semibold capitalize text-text-secondary">{gate.status}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Priority</p>
              <p className="mt-1 font-mono text-[12px] text-text-secondary">{gate.priority}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Type</p>
              <p className="mt-1 text-[12px] text-text-secondary">{GATE_TYPE_LABEL[gate.gateType] ?? gate.gateType}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Assigned To</p>
              <p className="mt-1 text-[12px] capitalize text-text-secondary">{gate.assignedRole ?? "Unassigned"}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Expiry Action</p>
              <p className="mt-1 text-[12px] capitalize text-text-secondary">{gate.expiryAction}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Requested By</p>
              <p className="mt-1 text-[12px] text-text-secondary">{gate.requestedBy}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Scan Details */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Scan Details</h2>
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Project</p>
              <p className="mt-1 text-[12px] font-semibold text-text-secondary">{gate.projectName}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Branch</p>
              <p className="mt-1 font-mono text-[12px] text-text-secondary">{gate.scan.branch}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Risk Score</p>
              <p className="mt-1 font-mono text-[12px] text-text-secondary">{gate.scan.riskScore}/100</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Findings</p>
              <p className="mt-1 font-mono text-[12px] text-text-secondary">{gate.scan.findingCount}</p>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <Link
              href={`/findings?scanId=${gate.scanId}`}
              className="text-[12px] font-medium text-accent hover:underline"
            >
              View Findings →
            </Link>
          </div>
        </div>
      </div>

      {/* SLA */}
      {isActionable && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">SLA</h2>
          <div className="rounded-xl border border-border bg-surface-1 p-5">
            <div className="flex items-center justify-between text-[12px]">
              <span className={`font-semibold ${sla.urgency === "critical" ? "text-status-fail" : sla.urgency === "warn" ? "text-status-warn" : "text-status-pass"}`}>
                {sla.text}
              </span>
              <span className="text-text-tertiary">{Math.round(progress)}% elapsed</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className={`h-full rounded-full transition-all ${slaBarColor}`}
                style={{ width: `${progress}%` }}
                role="progressbar"
                aria-valuenow={Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            {gate.escalatesAt && (
              <p className="mt-2 text-[11px] text-text-tertiary">
                Escalates: {new Date(gate.escalatesAt).toLocaleString()}
              </p>
            )}
            <p className="mt-1 text-[11px] text-text-tertiary">
              On expiry: <span className="capitalize font-medium">{gate.expiryAction}</span>
            </p>
          </div>
        </div>
      )}

      {/* Decision Form */}
      {isActionable && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Decision</h2>
          <div className="rounded-xl border border-border bg-surface-1 p-5">
            <label htmlFor="justification" className="block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Justification (min 10 characters)
            </label>
            <textarea
              id="justification"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Explain your decision..."
              rows={3}
              className="mt-2 w-full rounded-lg border border-border bg-surface-2 px-4 py-3 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {error && (
              <p className="mt-2 text-[12px] text-status-fail">{error}</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => handleDecision("approve")}
                disabled={!canSubmit}
                aria-describedby="justification"
                className="flex items-center gap-2 rounded-lg bg-status-pass/20 px-4 py-2 text-[13px] font-semibold text-status-pass border border-status-pass/30 transition-colors hover:bg-status-pass/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Submitting..." : "✓ Approve"}
              </button>
              <button
                onClick={() => handleDecision("reject")}
                disabled={!canSubmit}
                aria-describedby="justification"
                className="flex items-center gap-2 rounded-lg bg-status-fail/20 px-4 py-2 text-[13px] font-semibold text-status-fail border border-status-fail/30 transition-colors hover:bg-status-fail/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Submitting..." : "✗ Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activity Log */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Activity</h2>
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          {gate.decisions.length === 0 ? (
            <p className="text-[13px] text-text-tertiary">No decisions yet — awaiting reviewer action.</p>
          ) : (
            <div className="space-y-4">
              {gate.decisions.map((d) => (
                <div key={d.id} className="flex gap-3">
                  <span className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${d.decision === "approve" ? "bg-status-pass" : "bg-status-fail"}`} />
                  <div>
                    <p className="text-[12px] text-text-secondary">
                      <span className="font-semibold capitalize">{d.decision}d</span> by{" "}
                      <span className="font-medium">{d.decidedBy}</span>
                      <span className="text-text-tertiary"> · {formatRelativeTime(d.decidedAt)}</span>
                    </p>
                    <p className="mt-1 text-[12px] italic text-text-tertiary">
                      &ldquo;{d.justification}&rdquo;
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
