"use client";

import { useState, useCallback } from "react";
import type { AIProjectMetric } from "@/lib/types";

// ── Exports for testing ────────────────────────────────

export const SORT_OPTIONS = [
  { key: "aiRatio", label: "AI Ratio" },
  { key: "aiInfluenceScore", label: "Influence" },
  { key: "aiFiles", label: "AI Files" },
  { key: "totalFiles", label: "Total Files" },
] as const;

export function formatProjectRatio(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

// ── Component ──────────────────────────────────────────

type SortKey = (typeof SORT_OPTIONS)[number]["key"];

interface Props {
  projects: AIProjectMetric[];
  onCompare?: (projectIds: string[]) => void;
}

export function AIProjectLeaderboard({ projects, onCompare }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("aiRatio");
  const [sortDesc, setSortDesc] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDesc((d) => !d);
      } else {
        setSortKey(key);
        setSortDesc(true);
      }
    },
    [sortKey],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const sorted = [...projects].sort((a, b) => {
    const diff = (a[sortKey] as number) - (b[sortKey] as number);
    return sortDesc ? -diff : diff;
  });

  const canCompare = selected.size >= 2 && selected.size <= 5;

  return (
    <div className="animate-fade-up rounded-xl border border-border bg-surface-1 p-5" style={{ animationDelay: "0.03s" }}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">
          Project Leaderboard
        </h3>
        {onCompare && (
          <button
            disabled={!canCompare}
            onClick={() => onCompare(Array.from(selected))}
            className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-white transition-opacity disabled:opacity-40"
          >
            Compare ({selected.size})
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wider text-text-tertiary">
              {onCompare && <th className="pb-2 pr-2 w-8" />}
              <th className="pb-2 pr-4">Project</th>
              {SORT_OPTIONS.map((opt) => (
                <th key={opt.key} className="pb-2 pr-4">
                  <button
                    className="flex items-center gap-1 hover:text-text-primary transition-colors"
                    onClick={() => toggleSort(opt.key)}
                  >
                    {opt.label}
                    {sortKey === opt.key && (
                      <span>{sortDesc ? "\u2193" : "\u2191"}</span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr
                key={p.projectId}
                className="border-b border-border/50 text-text-secondary hover:bg-surface-2 transition-colors"
              >
                {onCompare && (
                  <td className="py-2.5 pr-2">
                    <input
                      type="checkbox"
                      checked={selected.has(p.projectId)}
                      onChange={() => toggleSelect(p.projectId)}
                      className="rounded border-border"
                    />
                  </td>
                )}
                <td className="py-2.5 pr-4 font-medium text-text-primary">
                  {p.projectName}
                </td>
                <td className="py-2.5 pr-4">{formatProjectRatio(p.aiRatio)}</td>
                <td className="py-2.5 pr-4">
                  {formatProjectRatio(p.aiInfluenceScore)}
                </td>
                <td className="py-2.5 pr-4">{p.aiFiles.toLocaleString()}</td>
                <td className="py-2.5 pr-4">{p.totalFiles.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
