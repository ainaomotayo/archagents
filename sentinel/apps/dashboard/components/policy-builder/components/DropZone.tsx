"use client";

import { useDroppable } from "@dnd-kit/core";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DropZoneProps {
  parentId: string;
  position: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DropZone({ parentId, position }: DropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop:${parentId}:${position}`,
    data: { parentId, position },
  });

  return (
    <div
      ref={setNodeRef}
      className={`transition-all ${
        isOver
          ? "h-[2px] bg-accent rounded-full my-1"
          : "h-[1px] bg-transparent"
      }`}
    />
  );
}
