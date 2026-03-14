"use client";

import { useDraggable } from "@dnd-kit/core";
import { defaultRegistry } from "../blocks/registry";
import type { BlockPlugin } from "../blocks/types";

// ---------------------------------------------------------------------------
// Palette item (draggable)
// ---------------------------------------------------------------------------

function PaletteItem({ plugin }: { plugin: BlockPlugin }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${plugin.type}`,
    data: { fromPalette: true, blockType: plugin.type },
  });

  const Icon = plugin.icon;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`rounded-lg border border-border bg-surface-1 px-3 py-2 cursor-grab hover:border-accent/50 transition-all ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-text-secondary" />
        <span className="text-[13px] font-medium text-text-primary">
          {plugin.label}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ label }: { label: string }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
      {label}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export function Palette() {
  const conditions = defaultRegistry.getByCategory("condition");
  const groups = defaultRegistry.getByCategory("group");
  const actions = defaultRegistry.getByCategory("action");

  return (
    <div className="flex flex-col gap-4 p-3 w-56 overflow-y-auto border-r border-border bg-surface-0">
      {/* Conditions */}
      <div className="flex flex-col gap-1.5">
        <SectionHeader label="Conditions" />
        {conditions.map((plugin) => (
          <PaletteItem key={plugin.type} plugin={plugin} />
        ))}
      </div>

      {/* Groups */}
      <div className="flex flex-col gap-1.5">
        <SectionHeader label="Groups" />
        {groups.map((plugin) => (
          <PaletteItem key={plugin.type} plugin={plugin} />
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5">
        <SectionHeader label="Actions" />
        {actions.map((plugin) => (
          <PaletteItem key={plugin.type} plugin={plugin} />
        ))}
      </div>
    </div>
  );
}
