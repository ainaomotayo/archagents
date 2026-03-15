"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { defaultRegistry } from "../blocks/registry";
import { useSelection } from "../contexts/selection-context";
import type { RuleNode, GroupNode } from "../blocks/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BlockCardProps {
  node: RuleNode;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRegistryKey(node: RuleNode): string {
  switch (node.type) {
    case "group":
      return `group:${(node as GroupNode).operator.toLowerCase()}`;
    case "condition":
      return `condition:${node.conditionType}`;
    case "action":
      return `action:${node.actionType}`;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BlockCard({ node }: BlockCardProps) {
  const { selectedNodeId, select, simulationTrace } = useSelection();
  const registryKey = getRegistryKey(node);
  const plugin = defaultRegistry.get(registryKey);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: node.id,
    data: { blockType: registryKey },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isSelected = selectedNodeId === node.id;
  const traceResult = simulationTrace?.get(node.id);

  // Determine ring class based on selection/simulation state
  let ringClass = "";
  if (simulationTrace) {
    if (traceResult === true) {
      ringClass = "ring-2 ring-status-pass";
    } else if (traceResult === false) {
      ringClass = "ring-2 ring-status-fail/50";
    }
  } else if (isSelected) {
    ringClass = "ring-2 ring-accent";
  }

  const config =
    node.type === "condition" || node.type === "action"
      ? (node.config as Record<string, unknown>)
      : {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        select(node.id);
      }}
      onPointerUp={(e) => {
        // useSortable captures onPointerDown; use onPointerUp for selection
        if (!isDragging) {
          e.stopPropagation();
          select(node.id);
        }
      }}
      data-testid="block-card"
      className={`relative rounded-lg border border-border bg-surface-1 px-3 py-2 cursor-pointer transition-all hover:border-accent/50 ${ringClass}`}
    >
      {/* Delete button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          // Dispatch is handled by parent context; we import useTree inline
          // to avoid circular deps, or we use selection context's delete via keyboard.
          // For click delete we dispatch directly.
          select(null);
          // Fire a custom event that the Canvas can pick up, or use tree context directly
          const event = new CustomEvent("policy-builder:delete-node", {
            detail: { nodeId: node.id },
          });
          document.dispatchEvent(event);
        }}
        className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-status-fail/10 hover:text-status-fail transition-colors"
        aria-label="Delete block"
      >
        <svg
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="h-3 w-3"
        >
          <path d="M3 3l6 6M9 3l-6 6" />
        </svg>
      </button>

      {/* Renderer */}
      {plugin ? (
        <plugin.Renderer node={node} config={config} />
      ) : (
        <span className="text-[13px] text-text-tertiary">
          Unknown block: {registryKey}
        </span>
      )}
    </div>
  );
}
