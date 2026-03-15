"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useTree, findParent } from "./tree-context";
import type { GroupNode } from "./tree-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SelectionContextValue {
  selectedNodeId: string | null;
  select: (nodeId: string | null) => void;
  simulationTrace: Map<string, boolean> | null;
  setSimulationTrace: (trace: Map<string, boolean> | null) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const SelectionContext = createContext<SelectionContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SelectionProvider({ children }: { children: ReactNode }) {
  const { tree, dispatch, index } = useTree();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [simulationTrace, setSimulationTrace] = useState<Map<string, boolean> | null>(
    null,
  );

  const select = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't interfere with input fields
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      if (!selectedNodeId) return;

      const parent = findParent(tree, selectedNodeId);
      if (!parent && selectedNodeId !== tree.id) return;

      switch (e.key) {
        case "ArrowUp": {
          e.preventDefault();
          if (!parent) return;
          const idx = parent.children.findIndex((c) => c.id === selectedNodeId);
          if (idx > 0) {
            setSelectedNodeId(parent.children[idx - 1].id);
          }
          break;
        }

        case "ArrowDown": {
          e.preventDefault();
          if (!parent) return;
          const idx = parent.children.findIndex((c) => c.id === selectedNodeId);
          if (idx < parent.children.length - 1) {
            setSelectedNodeId(parent.children[idx + 1].id);
          }
          break;
        }

        case "ArrowLeft": {
          e.preventDefault();
          // Move to parent group
          if (parent && parent.id !== tree.id) {
            setSelectedNodeId(parent.id);
          } else if (parent) {
            setSelectedNodeId(parent.id);
          }
          break;
        }

        case "ArrowRight": {
          e.preventDefault();
          // Move to first child if it's a group
          const node = index.get(selectedNodeId);
          if (node && node.type === "group" && (node as GroupNode).children.length > 0) {
            setSelectedNodeId((node as GroupNode).children[0].id);
          }
          break;
        }

        case "Delete":
        case "Backspace": {
          e.preventDefault();
          // Don't delete the root
          if (selectedNodeId === tree.id) return;
          dispatch({ type: "DELETE_NODE", nodeId: selectedNodeId });
          // Select parent after deletion
          if (parent) {
            setSelectedNodeId(parent.id);
          } else {
            setSelectedNodeId(null);
          }
          break;
        }

        case "Escape": {
          e.preventDefault();
          setSelectedNodeId(null);
          break;
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeId, tree, index, dispatch]);

  const value = useMemo<SelectionContextValue>(
    () => ({
      selectedNodeId,
      select,
      simulationTrace,
      setSimulationTrace,
    }),
    [selectedNodeId, select, simulationTrace, setSimulationTrace],
  );

  return <SelectionContext value={value}>{children}</SelectionContext>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) {
    throw new Error("useSelection must be used within a <SelectionProvider>");
  }
  return ctx;
}
