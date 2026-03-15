"use client";

import { useEffect, useState } from "react";
import type { FileAttribution } from "@/lib/types";

interface AttributionTableProps {
  scanId: string;
}

const classificationColors: Record<string, string> = {
  human: "bg-emerald-100 text-emerald-800",
  "ai-generated": "bg-red-100 text-red-800",
  "ai-assisted": "bg-amber-100 text-amber-800",
  mixed: "bg-purple-100 text-purple-800",
  unknown: "bg-gray-100 text-gray-800",
};

export function AttributionTable({ scanId }: AttributionTableProps) {
  const [attributions, setAttributions] = useState<FileAttribution[]>([]);
  const [sortKey, setSortKey] = useState<keyof FileAttribution>("file");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    import("@/lib/api").then(({ getIPAttributions }) =>
      getIPAttributions(scanId).then(setAttributions),
    );
  }, [scanId]);

  const sorted = [...attributions].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    }
    return 0;
  });

  const toggleSort = (key: keyof FileAttribution) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  if (attributions.length === 0) {
    return <p className="text-sm text-text-tertiary">No file attributions available.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
            <th className="cursor-pointer pb-2 pr-4" onClick={() => toggleSort("file")}>
              File {sortKey === "file" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}
            </th>
            <th className="cursor-pointer pb-2 pr-4" onClick={() => toggleSort("classification")}>
              Classification {sortKey === "classification" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}
            </th>
            <th className="cursor-pointer pb-2 pr-4" onClick={() => toggleSort("confidence")}>
              Confidence {sortKey === "confidence" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}
            </th>
            <th className="pb-2 pr-4">Tool</th>
            <th className="pb-2 pr-4">Source</th>
            <th className="cursor-pointer pb-2" onClick={() => toggleSort("loc")}>
              LOC {sortKey === "loc" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((attr) => (
            <tr key={attr.id} className="border-b border-border/50 hover:bg-surface-2">
              <td className="py-2 pr-4 font-mono text-text-secondary">{attr.file}</td>
              <td className="py-2 pr-4">
                <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium ${classificationColors[attr.classification] ?? "bg-gray-100 text-gray-800"}`}>
                  {attr.classification}
                </span>
              </td>
              <td className="py-2 pr-4">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${attr.confidence * 100}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-text-tertiary">
                    {(attr.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </td>
              <td className="py-2 pr-4 text-text-secondary">{attr.toolName ?? "\u2014"}</td>
              <td className="py-2 pr-4 text-text-secondary">{attr.primarySource}</td>
              <td className="py-2 tabular-nums text-text-tertiary">{attr.loc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
