"use client";

import { useDraggable } from "@dnd-kit/core";
import { defaultRegistry } from "../blocks/registry";
import { useTree } from "../contexts/tree-context";
import { createNodeFromPlugin } from "../contexts/drag-context";
import type { BlockPlugin } from "../blocks/types";

// ---------------------------------------------------------------------------
// Palette item (draggable + click-to-add)
// ---------------------------------------------------------------------------

function PaletteItem({ plugin }: { plugin: BlockPlugin }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${plugin.type}`,
    data: { fromPalette: true, blockType: plugin.type },
  });
  const { tree, dispatch } = useTree();

  const handleAdd = () => {
    const newNode = createNodeFromPlugin(plugin.type);
    if (newNode) {
      dispatch({
        type: "ADD_NODE",
        parentId: tree.id,
        node: newNode,
        position: tree.children.length,
      });
    }
  };

  const Icon = plugin.icon;

  return (
    <div className="flex items-center gap-1">
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={`flex-1 rounded-lg border border-border bg-surface-1 px-3 py-2 cursor-grab hover:border-accent/50 transition-all ${
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
      <button
        type="button"
        onClick={handleAdd}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-border text-text-tertiary hover:text-accent hover:border-accent/50 transition-colors"
        aria-label={`Add ${plugin.label}`}
        title={`Add ${plugin.label}`}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
          <path d="M8 3v10M3 8h10" />
        </svg>
      </button>
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
