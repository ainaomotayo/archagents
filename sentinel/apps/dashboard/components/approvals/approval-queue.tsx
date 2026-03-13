"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { ApprovalGate, ApprovalStats } from "@/lib/types";
import { ApprovalCard } from "./approval-card";
import { ApprovalStatsBar } from "./approval-stats-bar";
import { ApprovalDetailPanel } from "./approval-detail-panel";
import { useApprovalStream } from "@/lib/use-approval-stream";
import { submitDecision, reassignGate } from "@/app/(dashboard)/approvals/actions";

interface ApprovalQueueProps {
  initialGates: ApprovalGate[];
  initialStats: ApprovalStats;
}

type StatusFilter = "all" | "pending" | "escalated" | "approved" | "rejected" | "expired";

const FILTER_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "escalated", label: "Escalated" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
];

export function ApprovalQueue({ initialGates, initialStats }: ApprovalQueueProps) {
  const [gates, setGates] = useState<ApprovalGate[]>(initialGates);
  const [stats, setStats] = useState<ApprovalStats>(initialStats);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialGates.find((g) => g.status === "pending" || g.status === "escalated")?.id ?? null,
  );
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());

  // Index for O(1) SSE reconciliation
  const indexRef = useRef(new Map<string, number>());
  useEffect(() => {
    const idx = new Map<string, number>();
    gates.forEach((g, i) => idx.set(g.id, i));
    indexRef.current = idx;
  }, [gates]);

  const onGateUpdate = useCallback((updated: ApprovalGate) => {
    setGates((prev) => {
      const idx = indexRef.current.get(updated.id);
      if (idx !== undefined) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [updated, ...prev];
    });
  }, []);

  const { connected } = useApprovalStream(onGateUpdate);

  // Filtered + searched gates
  const filteredGates = useMemo(() => {
    let result = gates;
    if (filter !== "all") {
      result = result.filter((g) => g.status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (g) =>
          g.projectName.toLowerCase().includes(q) ||
          g.scan.branch.toLowerCase().includes(q) ||
          g.scan.commitHash.toLowerCase().includes(q),
      );
    }
    return result;
  }, [gates, filter, search]);

  // Filter counts
  const filterCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: gates.length,
      pending: 0,
      escalated: 0,
      approved: 0,
      rejected: 0,
      expired: 0,
    };
    for (const g of gates) {
      if (g.status in counts) counts[g.status as StatusFilter]++;
    }
    return counts;
  }, [gates]);

  const selectedGate = gates.find((g) => g.id === selectedId) ?? null;

  const handleDecision = useCallback(
    async (gateId: string, decision: "approve" | "reject", justification: string) => {
      setSubmittingId(gateId);

      // Capture pre-mutation snapshot for revert
      let snapshot: ApprovalGate | undefined;

      // Optimistic update + auto-advance using functional state
      setGates((prev) => {
        snapshot = prev.find((g) => g.id === gateId);
        const next = prev.map((g) =>
          g.id === gateId
            ? {
                ...g,
                status: decision === "approve" ? ("approved" as const) : ("rejected" as const),
                decidedAt: new Date().toISOString(),
                decisions: [
                  ...g.decisions,
                  {
                    id: `local-${Date.now()}`,
                    decidedBy: "you",
                    decision,
                    justification,
                    decidedAt: new Date().toISOString(),
                  },
                ],
              }
            : g,
        );

        // Auto-advance to next pending (uses fresh state)
        const nextPending = next.find(
          (g) => g.id !== gateId && (g.status === "pending" || g.status === "escalated"),
        );
        if (nextPending) {
          setSelectedId(nextPending.id);
          // Focus the next card after React re-renders
          requestAnimationFrame(() => {
            cardRefs.current.get(nextPending.id)?.focus();
          });
        }

        return next;
      });

      try {
        await submitDecision(gateId, decision, justification);
      } catch (err) {
        // Revert to pre-mutation snapshot
        if (snapshot) {
          setGates((prev) =>
            prev.map((g) => (g.id === gateId ? snapshot! : g)),
          );
        }
        setSelectedId(gateId);
        throw err;
      } finally {
        setSubmittingId(null);
      }
    },
    [],
  );

  const handleReassign = useCallback(
    async (gateId: string, assignedTo: string) => {
      await reassignGate(gateId, assignedTo);
      setGates((prev) =>
        prev.map((g) => (g.id === gateId ? { ...g, assignedTo } : g)),
      );
    },
    [],
  );

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="animate-fade-up" style={{ animationDelay: "0.03s" }}>
        <ApprovalStatsBar stats={stats} />
      </div>

      {/* Filters */}
      <div className="animate-fade-up flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ animationDelay: "0.06s" }}>
        <div className="flex gap-1">
          {FILTER_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              aria-label={`Filter by ${label}`}
              aria-pressed={filter === value}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                filter === value
                  ? "bg-accent-subtle text-accent border border-accent/30"
                  : "text-text-secondary hover:bg-surface-2 hover:text-text-primary border border-transparent"
              }`}
            >
              {label}
              <span className="ml-1 font-mono text-[10px] opacity-70">
                {filterCounts[value]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project, branch, commit..."
            aria-label="Search approval gates by project, branch, or commit"
            className="w-64 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[12px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {!connected && (
            <span className="flex items-center gap-1 text-[11px] text-status-warn">
              <span className="h-1.5 w-1.5 rounded-full bg-status-warn" />
              Reconnecting...
            </span>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      {filteredGates.length === 0 ? (
        <div className="animate-fade-up flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-surface-1" style={{ animationDelay: "0.09s" }}>
          <div className="text-center">
            <p className="text-[14px] font-semibold text-text-primary">
              {filter === "all" ? "No approval gates" : `No ${filter} gates`}
            </p>
            <p className="mt-1 text-[12px] text-text-tertiary">
              {filter === "all"
                ? "All scans are passing without requiring review."
                : "Try adjusting your filters."}
            </p>
          </div>
        </div>
      ) : (
        <div className="animate-fade-up grid gap-6 xl:grid-cols-[1fr_1fr]" style={{ animationDelay: "0.09s" }}>
          {/* List panel */}
          <div className="max-h-[calc(100vh-280px)] space-y-2 overflow-y-auto pr-1">
            {filteredGates.map((gate) => (
              <ApprovalCard
                key={gate.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(gate.id, el);
                  else cardRefs.current.delete(gate.id);
                }}
                gate={gate}
                selected={gate.id === selectedId}
                onClick={() => setSelectedId(gate.id)}
              />
            ))}
          </div>

          {/* Detail panel */}
          <div className="max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {selectedGate ? (
              <ApprovalDetailPanel
                gate={selectedGate}
                onDecision={handleDecision}
                onReassign={handleReassign}
                isSubmitting={submittingId === selectedGate.id}
              />
            ) : (
              <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-surface-1">
                <p className="text-[13px] text-text-tertiary">
                  Select a gate to view details
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
