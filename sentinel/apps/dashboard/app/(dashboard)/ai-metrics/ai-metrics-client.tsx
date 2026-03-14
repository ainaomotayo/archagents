"use client";

import { useState, useCallback } from "react";
import type {
  AIMetricsStats,
  AITrendResult,
  AIProjectMetric,
  AIAnomalyAlert,
  AIMetricsConfig,
  AIProjectComparison,
} from "@/lib/types";

import { AIMetricsStatCards } from "@/components/ai-metrics/ai-metrics-stat-cards";
import { AIMetricsTrendChart } from "@/components/ai-metrics/ai-metrics-trend-chart";
import { AIToolBreakdownChart } from "@/components/ai-metrics/ai-tool-breakdown-chart";
import { AIProjectLeaderboard } from "@/components/ai-metrics/ai-project-leaderboard";
import { AIProjectCompare } from "@/components/ai-metrics/ai-project-compare";
import { AIComplianceGaps } from "@/components/ai-metrics/ai-compliance-gaps";
import { AIAlertsPanel } from "@/components/ai-metrics/ai-alerts-panel";
import { AIMetricsConfigModal } from "@/components/ai-metrics/ai-metrics-config-modal";

import {
  fetchAIMetricsTrendAction,
  fetchAIMetricsCompareAction,
  updateAIMetricsConfigAction,
} from "./actions";

interface Props {
  initialStats: AIMetricsStats;
  initialTrend: AITrendResult;
  initialProjects: AIProjectMetric[];
  initialAlerts: AIAnomalyAlert[];
  initialConfig: AIMetricsConfig;
}

export function AIMetricsClient({
  initialStats,
  initialTrend,
  initialProjects,
  initialAlerts,
  initialConfig,
}: Props) {
  const [trend, setTrend] = useState(initialTrend);
  const [trendPeriod, setTrendPeriod] = useState(30);
  const [comparison, setComparison] = useState<AIProjectComparison | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [config, setConfig] = useState(initialConfig);

  const handlePeriodChange = useCallback(async (days: number) => {
    setTrendPeriod(days);
    try {
      const result = await fetchAIMetricsTrendAction(days);
      setTrend(result);
    } catch {
      // keep existing data on error
    }
  }, []);

  const handleCompare = useCallback(async (projectIds: string[]) => {
    if (projectIds.length < 2) {
      setComparison(null);
      return;
    }
    try {
      const result = await fetchAIMetricsCompareAction(projectIds, trendPeriod);
      setComparison(result);
    } catch {
      // keep existing data on error
    }
  }, [trendPeriod]);

  const handleConfigSave = useCallback(async (data: Partial<AIMetricsConfig>) => {
    const result = await updateAIMetricsConfigAction(data);
    setConfig(result);
    setConfigOpen(false);
  }, []);

  // Build compliance gaps from tool breakdown
  const gaps: Record<string, number> = {};
  for (const entry of initialStats.toolBreakdown) {
    if (entry.confirmedFiles > 0) {
      gaps[entry.tool] = entry.confirmedFiles;
    }
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <AIMetricsStatCards stats={initialStats} trend={trend} />

      {/* Trend + Tool breakdown (2-col) */}
      <div className="grid gap-6 lg:grid-cols-2">
        <AIMetricsTrendChart
          points={trend.points}
          onPeriodChange={handlePeriodChange}
          activePeriod={trendPeriod}
        />
        <AIToolBreakdownChart
          breakdown={initialStats.toolBreakdown}
        />
      </div>

      {/* Project leaderboard */}
      <AIProjectLeaderboard
        projects={initialProjects}
        onCompare={handleCompare}
      />

      {/* Project comparison (shows when projects selected) */}
      {comparison && (
        <AIProjectCompare
          comparison={comparison}
          projects={initialProjects}
          onClose={() => setComparison(null)}
        />
      )}

      {/* Gaps + Alerts (2-col) */}
      <div className="grid gap-6 lg:grid-cols-2">
        <AIComplianceGaps gaps={gaps} />
        <AIAlertsPanel alerts={initialAlerts} />
      </div>

      {/* Config button */}
      <div className="flex justify-end">
        <button
          onClick={() => setConfigOpen(true)}
          className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary"
        >
          Configure AI Metrics
        </button>
      </div>

      {/* Config modal */}
      <AIMetricsConfigModal
        open={configOpen}
        config={config}
        onClose={() => setConfigOpen(false)}
        onSave={handleConfigSave}
      />
    </div>
  );
}
