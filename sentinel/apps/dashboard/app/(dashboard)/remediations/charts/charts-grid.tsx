"use client";

import { useCallback } from "react";
import { BurndownChart } from "@/components/remediations/burndown-chart";
import { VelocityChart } from "@/components/remediations/velocity-chart";
import { AgingChart } from "@/components/remediations/aging-chart";
import { SlaChart } from "@/components/remediations/sla-chart";
import type {
  BurndownDataPoint,
  VelocityDataPoint,
  AgingDataPoint,
  SlaDataPoint,
} from "@/lib/types";
import {
  refreshBurndown,
  refreshVelocity,
  refreshAging,
  refreshSla,
} from "./chart-actions";

interface ChartsGridProps {
  initialBurndown: BurndownDataPoint[];
  initialVelocity: VelocityDataPoint[];
  initialAging: AgingDataPoint[];
  initialSla: SlaDataPoint[];
}

export function ChartsGrid({
  initialBurndown,
  initialVelocity,
  initialAging,
  initialSla,
}: ChartsGridProps) {
  const handleBurndownRefresh = useCallback(
    async (scope: string, scopeValue: string, days: number) => {
      return refreshBurndown(scope, scopeValue, days);
    },
    [],
  );

  const handleVelocityRefresh = useCallback(
    async (scope: string, scopeValue: string, days: number) => {
      return refreshVelocity(scope, scopeValue, days);
    },
    [],
  );

  const handleAgingRefresh = useCallback(
    async (scope: string, scopeValue: string) => {
      return refreshAging(scope, scopeValue);
    },
    [],
  );

  const handleSlaRefresh = useCallback(
    async (scope: string, scopeValue: string, days: number) => {
      return refreshSla(scope, scopeValue, days);
    },
    [],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BurndownChart initialData={initialBurndown} onRefresh={handleBurndownRefresh} />
      <VelocityChart initialData={initialVelocity} onRefresh={handleVelocityRefresh} />
      <AgingChart initialData={initialAging} onRefresh={handleAgingRefresh} />
      <SlaChart initialData={initialSla} onRefresh={handleSlaRefresh} />
    </div>
  );
}
