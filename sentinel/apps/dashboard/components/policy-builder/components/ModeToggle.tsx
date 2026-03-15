"use client";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ModeToggleProps {
  mode: "simple" | "advanced";
  onModeChange: (mode: "simple" | "advanced") => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div className="rounded-lg border border-border p-0.5 inline-flex">
      <button
        type="button"
        onClick={() => onModeChange("simple")}
        className={`rounded-md px-3 py-1 text-[13px] font-medium transition-colors ${
          mode === "simple"
            ? "bg-accent text-text-inverse"
            : "bg-surface-1 text-text-secondary hover:text-text-primary"
        }`}
      >
        Simple
      </button>
      <button
        type="button"
        onClick={() => onModeChange("advanced")}
        className={`rounded-md px-3 py-1 text-[13px] font-medium transition-colors ${
          mode === "advanced"
            ? "bg-accent text-text-inverse"
            : "bg-surface-1 text-text-secondary hover:text-text-primary"
        }`}
      >
        Advanced
      </button>
    </div>
  );
}
