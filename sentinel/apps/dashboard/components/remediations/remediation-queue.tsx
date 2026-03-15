"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { RemediationItem, RemediationStats } from "@/lib/types";
import { RemediationStatsBar } from "./remediation-stats-bar";
import {
  RemediationFilters,
  type TypeFilter,
  type StatusFilter,
  type PriorityFilter,
} from "./remediation-filters";
import { ViewToggle, usePersistedViewMode } from "./view-toggle";
import { RemediationTable } from "./remediation-table";
import { RemediationKanban } from "./remediation-kanban";
import { RemediationDetailPanel } from "./remediation-detail-panel";
import { RemediationCreateModal } from "./remediation-create-modal";
import { RemediationCard } from "./remediation-card";
import {
  updateRemediationAction,
  linkExternalAction,
  createRemediation,
} from "@/app/(dashboard)/remediations/actions";
import { useRemediationStream } from "@/hooks/use-remediation-stream";

interface RemediationQueueProps {
  initialItems: RemediationItem[];
  initialStats: RemediationStats;
}

export function RemediationQueue({ initialItems, initialStats }: RemediationQueueProps) {
  const router = useRouter();
  const [items, setItems] = useState<RemediationItem[]>(initialItems);
  const [stats, setStats] = useState<RemediationStats>(initialStats);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // SSE: refresh data when backend pushes remediation events
  useRemediationStream(useCallback(() => {
    router.refresh();
  }, [router]));
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [frameworkFilter, setFrameworkFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = usePersistedViewMode();
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());

  // Derive unique frameworks and assignees for filter dropdowns
  const frameworks = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.frameworkSlug) set.add(item.frameworkSlug);
    }
    return Array.from(set).sort();
  }, [items]);

  const assignees = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.assignedTo) set.add(item.assignedTo);
      if (item.children) {
        for (const child of item.children) {
          if (child.assignedTo) set.add(child.assignedTo);
        }
      }
    }
    return Array.from(set).sort();
  }, [items]);

  // Filter items
  const filteredItems = useMemo(() => {
    let result = items;

    // Collect all items including children for filtering
    const allItems: RemediationItem[] = [];
    for (const item of result) {
      allItems.push(item);
      if (item.children) {
        for (const child of item.children) {
          allItems.push(child);
        }
      }
    }

    // Filter top-level items (children shown via parent)
    result = items.filter((item) => {
      if (typeFilter !== "all" && item.itemType !== typeFilter) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (priorityFilter !== "all" && item.priority !== priorityFilter) return false;
      if (frameworkFilter && item.frameworkSlug !== frameworkFilter) return false;
      if (assigneeFilter && item.assignedTo !== assigneeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesParent =
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q);
        const matchesChild = item.children?.some(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            c.description.toLowerCase().includes(q),
        );
        if (!matchesParent && !matchesChild) return false;
      }
      return true;
    });

    return result;
  }, [items, typeFilter, statusFilter, priorityFilter, frameworkFilter, assigneeFilter, search]);

  // Find the selected item (could be parent or child)
  const selectedItem = useMemo(() => {
    for (const item of items) {
      if (item.id === selectedId) return item;
      if (item.children) {
        const child = item.children.find((c) => c.id === selectedId);
        if (child) return child;
      }
    }
    return null;
  }, [items, selectedId]);

  // Top-level items for parent picker in create modal
  const topLevelItems = useMemo(
    () => items.filter((i) => !i.parentId),
    [items],
  );

  const handleStatusChange = useCallback(
    async (id: string, newStatus: string) => {
      setSubmittingId(id);

      // Optimistic update
      setItems((prev) =>
        prev.map((item) => {
          if (item.id === id) {
            return {
              ...item,
              status: newStatus,
              updatedAt: new Date().toISOString(),
              completedAt: newStatus === "completed" ? new Date().toISOString() : item.completedAt,
            };
          }
          if (item.children) {
            return {
              ...item,
              children: item.children.map((c) =>
                c.id === id
                  ? {
                      ...c,
                      status: newStatus,
                      updatedAt: new Date().toISOString(),
                      completedAt: newStatus === "completed" ? new Date().toISOString() : c.completedAt,
                    }
                  : c,
              ),
            };
          }
          return item;
        }),
      );

      try {
        await updateRemediationAction(id, { status: newStatus });
      } catch {
        // Revert on failure
        setItems(initialItems);
      } finally {
        setSubmittingId(null);
      }
    },
    [initialItems],
  );

  const handleAssign = useCallback(
    async (id: string, assignedTo: string) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id === id) return { ...item, assignedTo };
          if (item.children) {
            return {
              ...item,
              children: item.children.map((c) =>
                c.id === id ? { ...c, assignedTo } : c,
              ),
            };
          }
          return item;
        }),
      );

      try {
        await updateRemediationAction(id, { assignedTo });
      } catch {
        setItems(initialItems);
      }
    },
    [initialItems],
  );

  const handleLinkExternal = useCallback(
    async (id: string, provider: string, externalRef: string) => {
      const fullRef = `${provider}:${externalRef}`;
      setItems((prev) =>
        prev.map((item) => {
          if (item.id === id) return { ...item, externalRef: fullRef };
          return item;
        }),
      );

      try {
        await linkExternalAction(id, provider, externalRef);
      } catch {
        setItems(initialItems);
      }
    },
    [initialItems],
  );

  const handleCreated = useCallback((newItem: RemediationItem) => {
    setItems((prev) => {
      if (newItem.parentId) {
        return prev.map((item) =>
          item.id === newItem.parentId
            ? { ...item, children: [...(item.children ?? []), newItem] }
            : item,
        );
      }
      return [{ ...newItem, children: [] }, ...prev];
    });
    // Update stats optimistically
    setStats((prev) => ({
      ...prev,
      open: prev.open + 1,
    }));
  }, []);

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="animate-fade-up" style={{ animationDelay: "0.03s" }}>
        <RemediationStatsBar stats={stats} />
      </div>

      {/* Filters + View Toggle */}
      <div
        className="animate-fade-up space-y-3"
        style={{ animationDelay: "0.06s" }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <RemediationFilters
            type={typeFilter}
            status={statusFilter}
            priority={priorityFilter}
            framework={frameworkFilter}
            assignee={assigneeFilter}
            search={search}
            onTypeChange={setTypeFilter}
            onStatusChange={setStatusFilter}
            onPriorityChange={setPriorityFilter}
            onFrameworkChange={setFrameworkFilter}
            onAssigneeChange={setAssigneeFilter}
            onSearchChange={setSearch}
            frameworks={frameworks}
            assignees={assignees}
          />
          <div className="flex items-center gap-2 flex-shrink-0">
            <ViewToggle value={viewMode} onChange={setViewMode} />
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-accent/90"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      {filteredItems.length === 0 ? (
        <div
          className="animate-fade-up flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-surface-1"
          style={{ animationDelay: "0.09s" }}
        >
          <div className="text-center">
            <p className="text-[14px] font-semibold text-text-primary">
              No remediation items
            </p>
            <p className="mt-1 text-[12px] text-text-tertiary">
              {typeFilter === "all" && statusFilter === "all"
                ? "Create a new remediation item to get started."
                : "Try adjusting your filters."}
            </p>
          </div>
        </div>
      ) : viewMode === "kanban" ? (
        <div className="animate-fade-up" style={{ animationDelay: "0.09s" }}>
          <RemediationKanban
            items={filteredItems}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onStatusChange={handleStatusChange}
          />
          {/* Detail panel below kanban when selected */}
          {selectedItem && (
            <div className="mt-6 max-w-2xl">
              <RemediationDetailPanel
                item={selectedItem}
                onStatusChange={handleStatusChange}
                onAssign={handleAssign}
                onLinkExternal={handleLinkExternal}
                isSubmitting={submittingId === selectedItem.id}
              />
            </div>
          )}
        </div>
      ) : (
        <div
          className="animate-fade-up grid gap-6 xl:grid-cols-[1fr_1fr]"
          style={{ animationDelay: "0.09s" }}
        >
          {/* Table panel */}
          <div className="max-h-[calc(100vh-340px)] overflow-y-auto pr-1">
            <RemediationTable
              items={filteredItems}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>

          {/* Detail panel */}
          <div className="max-h-[calc(100vh-340px)] overflow-y-auto pr-1">
            {selectedItem ? (
              <RemediationDetailPanel
                item={selectedItem}
                onStatusChange={handleStatusChange}
                onAssign={handleAssign}
                onLinkExternal={handleLinkExternal}
                isSubmitting={submittingId === selectedItem.id}
              />
            ) : (
              <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-surface-1">
                <p className="text-[13px] text-text-tertiary">
                  Select an item to view details
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Modal */}
      <RemediationCreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
        parentItems={topLevelItems}
        createAction={createRemediation}
      />
    </div>
  );
}
