"use client";

import { useState, useCallback, useMemo } from "react";
import type { FrameworkScore } from "./types";
import type { ComplianceTrendPoint } from "@/lib/types";
import type { SelectedCell } from "./types";
import type { AttestationOverride } from "./attestation-types";
import { SummaryCards } from "./SummaryCards";
import { FrameworkFilterBar } from "./FrameworkFilterBar";
import { HeatmapGrid } from "./HeatmapGrid";
import { ControlDetailPanel } from "./ControlDetailPanel";

interface GapAnalysisClientProps {
  frameworks: FrameworkScore[];
  trendData: Record<string, ComplianceTrendPoint[]>;
  attestationOverrides?: AttestationOverride[];
}

export function GapAnalysisClient({
  frameworks,
  trendData,
  attestationOverrides = [],
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

  const overrideMap = useMemo(() => {
    const map = new Map<string, AttestationOverride>();
    for (const o of attestationOverrides) {
      map.set(`${o.frameworkSlug}:${o.controlCode}`, o);
    }
    return map;
  }, [attestationOverrides]);

  const attestationInfo = useMemo(() => {
    if (!selectedCell) return null;
    const key = `${selectedCell.frameworkSlug}:${selectedCell.controlCode}`;
    const override = overrideMap.get(key);
    if (!override) return null;
    const fw = frameworks.find((f) => f.frameworkSlug === selectedCell.frameworkSlug);
    const ctrl = fw?.controlScores.find((c) => c.controlCode === selectedCell.controlCode);
    return {
      attestationId: override.attestationId,
      attestedScore: override.score,
      automatedScore: ctrl?.score ?? selectedCell.score,
      expiresAt: override.expiresAt,
    };
  }, [selectedCell, overrideMap, frameworks]);

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
        attestationOverrides={attestationOverrides}
      />

      <ControlDetailPanel cell={selectedCell} getTrends={getTrends} attestationInfo={attestationInfo} />
    </div>
  );
}
