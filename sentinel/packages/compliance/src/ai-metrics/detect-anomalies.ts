import type { ToolBreakdownEntry } from "./compute-tool-breakdown.js";

export interface AnomalyConfig {
  alertEnabled: boolean;
  alertMaxRatio: number | null;
  alertSpikeStdDev: number;
  alertNewTool: boolean;
}

export interface ProjectSnapshot {
  projectId: string;
  projectName: string;
  aiRatio: number;
  toolBreakdown: ToolBreakdownEntry[];
}

export interface AnomalyAlert {
  type: "threshold_exceeded" | "spike_detected" | "new_tool";
  projectId?: string;
  projectName?: string;
  detail: string;
  severity: "warning" | "critical";
  detectedAt: string;
}

export function detectAnomalies(
  orgRatio: number,
  projects: ProjectSnapshot[],
  config: AnomalyConfig,
  orgRatioHistory: number[],
  knownTools?: string[],
): AnomalyAlert[] {
  if (!config.alertEnabled) return [];

  const alerts: AnomalyAlert[] = [];
  const now = new Date().toISOString();

  // Threshold check
  if (config.alertMaxRatio !== null && orgRatio > config.alertMaxRatio) {
    alerts.push({
      type: "threshold_exceeded",
      detail: `Organization AI ratio ${(orgRatio * 100).toFixed(1)}% exceeds maximum ${(config.alertMaxRatio * 100).toFixed(1)}%`,
      severity: "critical",
      detectedAt: now,
    });
  }

  // Spike detection
  if (orgRatioHistory.length >= 3) {
    const mean =
      orgRatioHistory.reduce((s, v) => s + v, 0) / orgRatioHistory.length;
    const variance =
      orgRatioHistory.reduce((s, v) => s + (v - mean) ** 2, 0) /
      orgRatioHistory.length;
    const stddev = Math.sqrt(variance);
    const spikeThreshold = mean + config.alertSpikeStdDev * stddev;

    for (const project of projects) {
      if (project.aiRatio > spikeThreshold) {
        alerts.push({
          type: "spike_detected",
          projectId: project.projectId,
          projectName: project.projectName,
          detail: `Project "${project.projectName}" AI ratio ${(project.aiRatio * 100).toFixed(1)}% is a spike (threshold: ${(spikeThreshold * 100).toFixed(1)}%)`,
          severity: "warning",
          detectedAt: now,
        });
      }
    }
  }

  // New tool detection
  if (config.alertNewTool && knownTools) {
    const knownSet = new Set(knownTools);
    for (const project of projects) {
      for (const entry of project.toolBreakdown) {
        if (!knownSet.has(entry.tool)) {
          alerts.push({
            type: "new_tool",
            projectId: project.projectId,
            projectName: project.projectName,
            detail: `New AI tool "${entry.tool}" detected in project "${project.projectName}"`,
            severity: "warning",
            detectedAt: now,
          });
        }
      }
    }
  }

  return alerts;
}
