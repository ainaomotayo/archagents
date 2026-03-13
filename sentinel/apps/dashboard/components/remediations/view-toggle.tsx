"use client";

import { useEffect, useState } from "react";

export type ViewMode = "table" | "kanban";

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const STORAGE_KEY = "sentinel-remediation-view";

export function usePersistedViewMode(): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>("table");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "table" || saved === "kanban") setMode(saved);
    } catch {
      // SSR or storage unavailable
    }
  }, []);

  const setAndPersist = (m: ViewMode) => {
    setMode(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      // ignore
    }
  };

  return [mode, setAndPersist];
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="flex rounded-lg border border-border bg-surface-1">
      <button
        onClick={() => onChange("table")}
        aria-pressed={value === "table"}
        className={`flex items-center gap-1.5 rounded-l-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
          value === "table"
            ? "bg-accent-subtle text-accent"
            : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
        Table
      </button>
      <button
        onClick={() => onChange("kanban")}
        aria-pressed={value === "kanban"}
        className={`flex items-center gap-1.5 rounded-r-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
          value === "kanban"
            ? "bg-accent-subtle text-accent"
            : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="6" height="16" rx="1" />
          <rect x="14" y="4" width="6" height="10" rx="1" />
        </svg>
        Kanban
      </button>
    </div>
  );
}
