"use client";

import { useCallback, useMemo } from "react";
import { useSelection } from "../contexts/selection-context";
import { useTree } from "../contexts/tree-context";
import type { GroupNode, RuleNode } from "../contexts/tree-context";
import { defaultRegistry } from "../blocks/registry";

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

export function PropertyPanel() {
  const { selectedNodeId } = useSelection();
  const { index, dispatch } = useTree();

  const node = useMemo(() => {
    if (!selectedNodeId) return null;
    return index.get(selectedNodeId) ?? null;
  }, [selectedNodeId, index]);

  const plugin = useMemo(() => {
    if (!node) return null;
    const key = getRegistryKey(node);
    return defaultRegistry.get(key) ?? null;
  }, [node]);

  const config = useMemo(() => {
    if (!node) return {};
    if (node.type === "condition" || node.type === "action") {
      return node.config as Record<string, unknown>;
    }
    return {};
  }, [node]);

  const handleChange = useCallback(
    (newConfig: unknown) => {
      if (!node) return;
      dispatch({
        type: "UPDATE_NODE",
        nodeId: node.id,
        patch: { config: newConfig as Record<string, unknown> },
      });
    },
    [node, dispatch],
  );

  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary mb-2">
        Properties
      </h3>
      <div className="rounded-xl border border-border bg-surface-0 p-4">
        {node && plugin ? (
          <plugin.PropertyEditor config={config} onChange={handleChange} />
        ) : (
          <p className="text-[13px] text-text-tertiary">
            Select a block to edit its properties
          </p>
        )}
      </div>
    </div>
  );
}
