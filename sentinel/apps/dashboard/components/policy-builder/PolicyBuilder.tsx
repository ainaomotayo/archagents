"use client";

import { useState } from "react";
import type { GroupNode } from "./contexts/tree-context";
import { TreeProvider, useTree } from "./contexts/tree-context";
import { DragProvider } from "./contexts/drag-context";
import { SelectionProvider } from "./contexts/selection-context";
import { ValidationProvider } from "./contexts/validation-context";
import { Canvas } from "./components/Canvas";
import { Palette } from "./components/Palette";
import { PropertyPanel } from "./components/PropertyPanel";
import { ValidationPanel } from "./components/ValidationPanel";
import { ModeToggle } from "./components/ModeToggle";
import { YamlPreview } from "./components/YamlPreview";
import { SimulationPanel } from "./components/SimulationPanel";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PolicyBuilderProps {
  initialTree?: GroupNode;
  onChange?: (tree: GroupNode) => void;
  mode?: "simple" | "advanced";
}

// ---------------------------------------------------------------------------
// Default tree
// ---------------------------------------------------------------------------

const DEFAULT_TREE: GroupNode = {
  id: "root",
  type: "group",
  operator: "AND",
  children: [],
};

// ---------------------------------------------------------------------------
// Undo / Redo icons
// ---------------------------------------------------------------------------

function UndoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M3 7h7a3 3 0 0 1 0 6H8" />
      <path d="M6 4L3 7l3 3" />
    </svg>
  );
}

function RedoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M13 7H6a3 3 0 0 0 0 6h2" />
      <path d="M10 4l3 3-3 3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Inner component (needs tree context)
// ---------------------------------------------------------------------------

function PolicyBuilderInner({ mode, onModeChange }: { mode: "simple" | "advanced"; onModeChange: (m: "simple" | "advanced") => void }) {
  const { dispatch, canUndo, canRedo } = useTree();

  return (
    <DragProvider>
      <SelectionProvider>
        <ValidationProvider>
          <div className="flex flex-col gap-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => dispatch({ type: "UNDO" })}
                  disabled={!canUndo}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-tertiary hover:text-text-primary disabled:opacity-30 transition-colors"
                  aria-label="Undo"
                >
                  <UndoIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "REDO" })}
                  disabled={!canRedo}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-tertiary hover:text-text-primary disabled:opacity-30 transition-colors"
                  aria-label="Redo"
                >
                  <RedoIcon className="h-4 w-4" />
                </button>
              </div>
              <ModeToggle mode={mode} onModeChange={onModeChange} />
            </div>

            {/* Main layout: 3 columns */}
            <div className="grid grid-cols-[240px_1fr_280px] gap-4">
              {/* Left: Palette */}
              <Palette />

              {/* Center: Canvas */}
              <div className="min-h-[400px] rounded-xl border border-border bg-surface-0 p-4 overflow-auto">
                <Canvas />
              </div>

              {/* Right: Panels */}
              <div className="space-y-4">
                <PropertyPanel />
                <ValidationPanel />
                {mode === "advanced" && <YamlPreview />}
                {mode === "advanced" && <SimulationPanel />}
              </div>
            </div>
          </div>
        </ValidationProvider>
      </SelectionProvider>
    </DragProvider>
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export default function PolicyBuilder({
  initialTree,
  onChange,
  mode: initialMode,
}: PolicyBuilderProps) {
  const [mode, setMode] = useState<"simple" | "advanced">(initialMode ?? "simple");

  return (
    <TreeProvider initialTree={initialTree ?? DEFAULT_TREE} onChange={onChange}>
      <PolicyBuilderInner mode={mode} onModeChange={setMode} />
    </TreeProvider>
  );
}

export { PolicyBuilder };
