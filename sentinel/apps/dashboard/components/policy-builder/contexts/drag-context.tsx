"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensors,
  useSensor,
  type DragStartEvent,
  type DragEndEvent,
  pointerWithin,
} from "@dnd-kit/core";
import { defaultRegistry } from "../blocks/registry";
import { useTree } from "./tree-context";
import type { RuleNode, GroupNode, ConditionNode, ActionNode } from "./tree-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DragState {
  activeId: string | null;
  activeType: string | null; // block type from registry
  overId: string | null;
  source: "palette" | "canvas" | null;
}

interface DragContextValue extends DragState {}

const initialDragState: DragState = {
  activeId: null,
  activeType: null,
  overId: null,
  source: null,
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DragContext = createContext<DragContextValue | null>(null);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function createNodeFromPlugin(blockType: string): RuleNode | null {
  const plugin = defaultRegistry.get(blockType);
  if (!plugin) return null;

  const id = crypto.randomUUID();

  if (plugin.category === "group") {
    const operator = blockType.replace("group:", "").toUpperCase() as
      | "AND"
      | "OR"
      | "NOT";
    return {
      id,
      type: "group",
      operator,
      children: [],
    } satisfies GroupNode;
  }

  if (plugin.category === "condition") {
    const conditionType = blockType.replace("condition:", "");
    return {
      id,
      type: "condition",
      conditionType,
      config: Object.assign({}, plugin.defaultConfig) as Record<string, unknown>,
    } satisfies ConditionNode;
  }

  if (plugin.category === "action") {
    const actionType = blockType.replace("action:", "");
    return {
      id,
      type: "action",
      actionType,
      config: Object.assign({}, plugin.defaultConfig) as Record<string, unknown>,
    } satisfies ActionNode;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function DragProvider({ children }: { children: ReactNode }) {
  const { dispatch } = useTree();
  const [dragState, setDragState] = useState<DragState>(initialDragState);

  // Require 5px movement before activating drag so clicks pass through for selection
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current as Record<string, unknown> | undefined;
    const fromPalette = data?.fromPalette === true;
    const blockType = (data?.blockType as string) ?? null;

    setDragState({
      activeId: String(active.id),
      activeType: blockType,
      overId: null,
      source: fromPalette ? "palette" : "canvas",
    });
  }, []);

  const handleDragOver = useCallback((event: { over: { id: string | number } | null }) => {
    setDragState((prev) => ({
      ...prev,
      overId: event.over ? String(event.over.id) : null,
    }));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over) {
        const overData = over.data.current as
          | { parentId: string; position: number }
          | undefined;
        const activeData = active.data.current as Record<string, unknown> | undefined;
        const fromPalette = activeData?.fromPalette === true;

        if (overData?.parentId !== undefined && overData?.position !== undefined) {
          if (fromPalette) {
            // Create new node from palette
            const blockType = activeData?.blockType as string;
            if (blockType) {
              const newNode = createNodeFromPlugin(blockType);
              if (newNode) {
                dispatch({
                  type: "ADD_NODE",
                  parentId: overData.parentId,
                  node: newNode,
                  position: overData.position,
                });
              }
            }
          } else {
            // Move existing node on canvas
            dispatch({
              type: "MOVE_NODE",
              nodeId: String(active.id),
              newParentId: overData.parentId,
              position: overData.position,
            });
          }
        }
      }

      setDragState(initialDragState);
    },
    [dispatch],
  );

  const handleDragCancel = useCallback(() => {
    setDragState(initialDragState);
  }, []);

  const value = useMemo<DragContextValue>(() => dragState, [dragState]);

  // Render overlay preview
  const overlayContent = useMemo(() => {
    if (!dragState.activeType) return null;
    const plugin = defaultRegistry.get(dragState.activeType);
    if (!plugin) return null;
    const Icon = plugin.icon;
    return (
      <div className="rounded-lg border border-accent/50 bg-surface-1 px-3 py-2 opacity-80 shadow-lg">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-accent" />
          <span className="text-[13px] font-semibold text-text-primary">
            {plugin.label}
          </span>
        </div>
      </div>
    );
  }, [dragState.activeType]);

  return (
    <DragContext value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}
        <DragOverlay dropAnimation={null}>{overlayContent}</DragOverlay>
      </DndContext>
    </DragContext>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDrag(): DragContextValue {
  const ctx = useContext(DragContext);
  if (!ctx) {
    throw new Error("useDrag must be used within a <DragProvider>");
  }
  return ctx;
}
