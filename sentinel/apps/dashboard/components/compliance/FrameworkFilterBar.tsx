"use client";

interface FrameworkFilterBarProps {
  frameworks: { slug: string; name: string }[];
  selected: string[];
  onToggle: (slug: string) => void;
}

export function FrameworkFilterBar({
  frameworks,
  selected,
  onToggle,
}: FrameworkFilterBarProps) {
  const allSelected = selected.length === 0;

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Framework filter">
      <button
        onClick={() => {
          for (const fw of frameworks) {
            if (selected.includes(fw.slug)) onToggle(fw.slug);
          }
        }}
        className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
          allSelected
            ? "border-accent bg-accent-subtle text-accent"
            : "border-border bg-surface-1 text-text-secondary hover:bg-surface-2"
        }`}
      >
        All
      </button>
      {frameworks.map((fw) => {
        const active = selected.includes(fw.slug);
        return (
          <button
            key={fw.slug}
            onClick={() => onToggle(fw.slug)}
            className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
              active
                ? "border-accent bg-accent-subtle text-accent"
                : "border-border bg-surface-1 text-text-secondary hover:bg-surface-2"
            }`}
          >
            {fw.name}
          </button>
        );
      })}
    </div>
  );
}
