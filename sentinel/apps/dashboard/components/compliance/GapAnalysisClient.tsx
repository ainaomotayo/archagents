"use client";

import { useState, useCallback } from "react";
import type { FrameworkScore } from "./types";
import type { ComplianceTrendPoint } from "@/lib/types";
import type { SelectedCell } from "./types";
import { SummaryCards } from "./SummaryCards";
import { FrameworkFilterBar } from "./FrameworkFilterBar";
import { HeatmapGrid } from "./HeatmapGrid";
import { ControlDetailPanel } from "./ControlDetailPanel";

interface GapAnalysisClientProps {
  frameworks: FrameworkScore[];
  trendData: Record<string, ComplianceTrendPoint[]>;
}

export function GapAnalysisClient({
  frameworks,
  trendData,
}: GapAnalysisClientProps) {
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([]);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);

  const handleToggle = useCallback((slug: string) => {
    setSelectedFrameworks((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : [...prev, slug],
    );
  }, []);

  const getTrends = useCallback(
    async (slug: string): Promise<ComplianceTrendPoint[]> => {
      return trendData[slug] ?? [];
    },
    [trendData],
  );

  const filterOptions = frameworks.map((fw) => ({
    slug: fw.frameworkSlug,
    name: fw.frameworkName,
  }));

  return (
    <div className="space-y-5">
      <SummaryCards frameworks={frameworks} />

      <FrameworkFilterBar
        frameworks={filterOptions}
        selected={selectedFrameworks}
        onToggle={handleToggle}
      />

      <HeatmapGrid
        frameworks={frameworks}
        selectedFrameworks={selectedFrameworks}
        onSelectCell={setSelectedCell}
      />

      <ControlDetailPanel cell={selectedCell} getTrends={getTrends} />
    </div>
  );
}
