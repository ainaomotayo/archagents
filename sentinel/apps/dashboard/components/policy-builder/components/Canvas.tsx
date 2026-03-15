"use client";

import { useEffect } from "react";
import { useTree } from "../contexts/tree-context";
import type { GroupNode } from "../contexts/tree-context";
import { BlockCard } from "./BlockCard";
import { DropZone } from "./DropZone";

// ---------------------------------------------------------------------------
// Operator -> border color mapping
// ---------------------------------------------------------------------------

const OPERATOR_BORDER_COLOR: Record<string, string> = {
  AND: "border-l-accent",
  OR: "border-l-amber-500",
  NOT: "border-l-red-500",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CanvasProps {
  node: GroupNode;
  depth?: number;
}

// ---------------------------------------------------------------------------
// Recursive group renderer
// ---------------------------------------------------------------------------

function GroupRenderer({ node, depth = 0 }: CanvasProps) {
  const borderColor = OPERATOR_BORDER_COLOR[node.operator] ?? "border-l-accent";

  return (
    <div
      className={`rounded-xl border border-border bg-surface-0 p-3 space-y-2 border-l-4 ${borderColor}`}
    >
      {/* Group header */}
      <BlockCard node={node} />

      {/* Children with drop zones */}
      {node.children.length === 0 ? (
        <div className="min-h-[60px] flex items-center justify-center">
          <DropZone parentId={node.id} position={0} />
          <span className="text-[12px] text-text-tertiary">
            Drop blocks here
          </span>
        </div>
      ) : (
        <div className="space-y-1">
          {node.children.map((child, i) => (
            <div key={child.id}>
              <DropZone parentId={node.id} position={i} />
              {child.type === "group" ? (
                <GroupRenderer node={child} depth={depth + 1} />
              ) : (
                <BlockCard node={child} />
              )}
            </div>
          ))}
          <DropZone
            parentId={node.id}
            position={node.children.length}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Canvas root
// ---------------------------------------------------------------------------

export function Canvas() {
  const { tree, dispatch } = useTree();

  // Listen for delete-node custom events from BlockCard
  useEffect(() => {
    function handleDelete(e: Event) {
      const detail = (e as CustomEvent).detail as { nodeId: string };
      if (detail?.nodeId) {
        dispatch({ type: "DELETE_NODE", nodeId: detail.nodeId });
      }
    }

    document.addEventListener("policy-builder:delete-node", handleDelete);
    return () =>
      document.removeEventListener("policy-builder:delete-node", handleDelete);
  }, [dispatch]);

  return (
    <div className="flex-1 overflow-auto p-4" data-testid="policy-canvas">
      <GroupRenderer node={tree} />
    </div>
  );
}
