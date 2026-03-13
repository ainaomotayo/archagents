"use client";

import { useState, useMemo } from "react";
import type { RemediationItem } from "@/lib/types";
import { PRIORITY_STYLES, STATUS_STYLES, STATUS_LABELS, isOverdue, formatDueDate } from "./remediation-card";

interface RemediationTableProps {
  items: RemediationItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function RemediationTable({ items, selectedId, onSelect }: RemediationTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const sortedItems = useMemo(() => {
    return [...items]
      .filter((item) => !item.parentId)
      .sort((a, b) => b.priorityScore - a.priorityScore);
  }, [items]);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface-1">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="w-8 px-3 py-2.5" />
            <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              Title
            </th>
            <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              Priority
            </th>
            <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              Status
            </th>
            <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              Assignee
            </th>
            <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              Due Date
            </th>
            <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              Score
            </th>
            <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              External
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((item) => {
            const hasChildren = (item.children?.length ?? 0) > 0;
            const isExpanded = expandedIds.has(item.id);

            return (
              <TableRowGroup
                key={item.id}
                item={item}
                hasChildren={hasChildren}
                isExpanded={isExpanded}
                selectedId={selectedId}
                onSelect={onSelect}
                onToggle={toggleExpand}
              />
            );
          })}
        </tbody>
      </table>
      {sortedItems.length === 0 && (
        <div className="flex h-32 items-center justify-center">
          <p className="text-[13px] text-text-tertiary">No remediation items match your filters</p>
        </div>
      )}
    </div>
  );
}

function TableRowGroup({
  item,
  hasChildren,
  isExpanded,
  selectedId,
  onSelect,
  onToggle,
}: {
  item: RemediationItem;
  hasChildren: boolean;
  isExpanded: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, e: React.MouseEvent) => void;
}) {
  return (
    <>
      <TableRow
        item={item}
        isParent
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        isSelected={selectedId === item.id}
        onSelect={() => onSelect(item.id)}
        onToggle={(e) => onToggle(item.id, e)}
      />
      {isExpanded &&
        item.children?.map((child) => (
          <TableRow
            key={child.id}
            item={child}
            isParent={false}
            hasChildren={false}
            isExpanded={false}
            isSelected={selectedId === child.id}
            onSelect={() => onSelect(child.id)}
            onToggle={() => {}}
          />
        ))}
    </>
  );
}

function TableRow({
  item,
  isParent,
  hasChildren,
  isExpanded,
  isSelected,
  onSelect,
  onToggle,
}: {
  item: RemediationItem;
  isParent: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: (e: React.MouseEvent) => void;
}) {
  const priorityStyle = PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.medium;
  const statusStyle = STATUS_STYLES[item.status] ?? STATUS_STYLES.open;
  const overdue = isOverdue(item);

  return (
    <tr
      onClick={onSelect}
      className={`cursor-pointer border-b border-border/50 transition-colors ${
        isSelected ? "bg-accent-subtle/40" : "hover:bg-surface-2"
      } ${!isParent ? "border-l-2 border-l-border" : ""}`}
    >
      <td className="px-3 py-2.5">
        {hasChildren ? (
          <button
            onClick={onToggle}
            className="flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-surface-3 hover:text-text-primary transition-colors"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ) : !isParent ? (
          <span className="flex h-5 w-5 items-center justify-center text-text-tertiary">
            <span className="h-1 w-1 rounded-full bg-text-tertiary" />
          </span>
        ) : null}
      </td>
      <td className={`px-3 py-2.5 ${!isParent ? "pl-8" : ""}`}>
        <span className="text-[12px] font-semibold text-text-primary line-clamp-1">
          {item.title}
        </span>
        {isParent && item.frameworkSlug && (
          <span className="ml-2 font-mono text-[10px] uppercase text-text-tertiary">
            {item.frameworkSlug}
            {item.controlCode ? ` / ${item.controlCode}` : ""}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${priorityStyle.bg} ${priorityStyle.text}`}>
          {item.priority}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusStyle.bg} ${statusStyle.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
          {STATUS_LABELS[item.status] ?? item.status}
        </span>
      </td>
      <td className="px-3 py-2.5 text-[12px] text-text-secondary">
        {item.assignedTo ?? <span className="text-text-tertiary">--</span>}
      </td>
      <td className="px-3 py-2.5">
        {item.dueDate ? (
          <span className={`text-[12px] ${overdue ? "font-semibold text-status-fail" : "text-text-secondary"}`}>
            {formatDueDate(item.dueDate)}
          </span>
        ) : (
          <span className="text-[12px] text-text-tertiary">--</span>
        )}
      </td>
      <td className="px-3 py-2.5 font-mono text-[12px] text-text-secondary">
        {item.priorityScore}
      </td>
      <td className="px-3 py-2.5">
        {item.externalRef ? (
          <span className="font-mono text-[10px] text-accent truncate max-w-[100px] block">
            {item.externalRef}
          </span>
        ) : (
          <span className="text-[12px] text-text-tertiary">--</span>
        )}
      </td>
    </tr>
  );
}
