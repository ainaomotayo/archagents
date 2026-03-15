"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { FrameworkScore, SelectedCell } from "./types";
import { HeatmapCell } from "./HeatmapCell";

interface HeatmapGridProps {
  frameworks: FrameworkScore[];
  selectedFrameworks: string[];
  onSelectCell: (cell: SelectedCell | null) => void;
}

const CELL_W = 48;
const CELL_H = 36;
const CELL_GAP = 3;
const LABEL_W = 100;
const HEADER_H = 60;

export function HeatmapGrid({
  frameworks,
  selectedFrameworks,
  onSelectCell,
}: HeatmapGridProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const visible =
    selectedFrameworks.length === 0
      ? frameworks
      : frameworks.filter((fw) => selectedFrameworks.includes(fw.frameworkSlug));

  const allControlCodes = Array.from(
    new Set(visible.flatMap((fw) => fw.controlScores.map((c) => c.controlCode))),
  );

  const gridW = LABEL_W + allControlCodes.length * (CELL_W + CELL_GAP);
  const gridH = HEADER_H + visible.length * (CELL_H + CELL_GAP);

  const handleClick = useCallback(
    (fw: FrameworkScore, code: string) => {
      const key = `${fw.frameworkSlug}:${code}`;
      if (selectedKey === key) {
        setSelectedKey(null);
        onSelectCell(null);
        return;
      }
      setSelectedKey(key);
      const cs = fw.controlScores.find((c) => c.controlCode === code);
      if (cs) {
        onSelectCell({
          frameworkSlug: fw.frameworkSlug,
          frameworkName: fw.frameworkName,
          controlCode: cs.controlCode,
          controlName: cs.controlName,
          score: cs.score,
          passing: cs.passing,
          failing: cs.failing,
          total: cs.total,
        });
      }
    },
    [selectedKey, onSelectCell],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelectedKey(null);
        onSelectCell(null);
      }
    }

    svg.addEventListener("keydown", handleKeyDown);
    return () => svg.removeEventListener("keydown", handleKeyDown);
  }, [onSelectCell]);

  if (visible.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-surface-1">
        <p className="text-[13px] text-text-tertiary">
          No frameworks selected
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface-1 p-4">
      <svg
        ref={svgRef}
        width={gridW}
        height={gridH}
        viewBox={`0 0 ${gridW} ${gridH}`}
        className="block"
        role="grid"
        aria-label="Compliance heatmap"
        tabIndex={0}
      >
        {allControlCodes.map((code, ci) => (
          <text
            key={code}
            x={LABEL_W + ci * (CELL_W + CELL_GAP) + CELL_W / 2}
            y={HEADER_H - 8}
            textAnchor="middle"
            className="fill-text-tertiary text-[10px]"
          >
            {code}
          </text>
        ))}

        {visible.map((fw, ri) => {
          const rowY = HEADER_H + ri * (CELL_H + CELL_GAP);
          const scoreMap = new Map(
            fw.controlScores.map((c) => [c.controlCode, c]),
          );

          return (
            <g key={fw.frameworkSlug}>
              <text
                x={LABEL_W - 8}
                y={rowY + CELL_H / 2 + 4}
                textAnchor="end"
                className="fill-text-secondary text-[11px] font-medium"
              >
                {fw.frameworkName.length > 12
                  ? fw.frameworkSlug.toUpperCase()
                  : fw.frameworkName}
              </text>

              {allControlCodes.map((code, ci) => {
                const cs = scoreMap.get(code);
                const cellKey = `${fw.frameworkSlug}:${code}`;
                return (
                  <HeatmapCell
                    key={cellKey}
                    score={cs ? cs.score : -1}
                    total={cs ? cs.total : 0}
                    controlCode={code}
                    controlName={cs?.controlName ?? "Not assessed"}
                    x={LABEL_W + ci * (CELL_W + CELL_GAP)}
                    y={rowY}
                    width={CELL_W}
                    height={CELL_H}
                    isSelected={selectedKey === cellKey}
                    onClick={() => {
                      if (cs) handleClick(fw, code);
                    }}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
