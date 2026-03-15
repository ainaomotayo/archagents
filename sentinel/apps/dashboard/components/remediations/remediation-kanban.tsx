"use client";

import { useMemo, useState, useCallback } from "react";
import type { RemediationItem } from "@/lib/types";
import { RemediationCard } from "./remediation-card";

interface RemediationKanbanProps {
  items: RemediationItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStatusChange?: (itemId: string, newStatus: string) => void;
}

const COLUMNS: { key: string; label: string; dotColor: string }[] = [
  { key: "open", label: "Open", dotColor: "bg-status-warn" },
  { key: "in_progress", label: "In Progress", dotColor: "bg-status-info" },
  { key: "completed", label: "Completed", dotColor: "bg-status-pass" },
  { key: "accepted_risk", label: "Accepted Risk", dotColor: "bg-text-tertiary" },
];

export function RemediationKanban({ items, selectedId, onSelect, onStatusChange }: RemediationKanbanProps) {
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Top-level items only, grouped by status
  const columns = useMemo(() => {
    const topLevel = items.filter((i) => !i.parentId);
    const grouped: Record<string, RemediationItem[]> = {};
    for (const col of COLUMNS) {
      grouped[col.key] = topLevel
        .filter((i) => i.status === col.key)
        .sort((a, b) => b.priorityScore - a.priorityScore);
    }
    return grouped;
  }, [items]);

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, itemId: string) => {
    e.dataTransfer.setData("text/plain", itemId);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, columnKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnKey);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, columnKey: string) => {
      e.preventDefault();
      setDragOverColumn(null);
      const itemId = e.dataTransfer.getData("text/plain");
      if (itemId && onStatusChange) {
        onStatusChange(itemId, columnKey);
      }
    },
    [onStatusChange],
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map(({ key, label, dotColor }) => (
        <div
          key={key}
          className={`flex flex-col rounded-xl border border-border bg-surface-1 transition-shadow ${
            dragOverColumn === key ? "ring-2 ring-accent/50" : ""
          }`}
          onDragOver={(e) => handleDragOver(e, key)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, key)}
        >
          {/* Column header */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
            <span className="text-[12px] font-semibold text-text-primary">{label}</span>
            <span className="ml-auto font-mono text-[11px] text-text-tertiary">
              {columns[key]?.length ?? 0}
            </span>
          </div>
          {/* Cards */}
          <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 380px)" }}>
            {(columns[key] ?? []).length === 0 ? (
              <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border">
                <p className="text-[11px] text-text-tertiary">No items</p>
              </div>
            ) : (
              (columns[key] ?? []).map((item) => (
                <div
                  key={item.id}
                  draggable="true"
                  onDragStart={(e) => handleDragStart(e, item.id)}
                  className="cursor-grab active:cursor-grabbing"
                >
                  <RemediationCard
                    item={item}
                    selected={selectedId === item.id}
                    onClick={() => onSelect(item.id)}
                    compact
                  />
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
