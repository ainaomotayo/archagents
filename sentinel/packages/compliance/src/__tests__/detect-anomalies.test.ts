import { describe, it, expect } from "vitest";
import {
  detectAnomalies,
  type AnomalyConfig,
  type ProjectSnapshot,
} from "../ai-metrics/detect-anomalies.js";

function makeConfig(overrides?: Partial<AnomalyConfig>): AnomalyConfig {
  return {
    alertEnabled: true,
    alertMaxRatio: 0.5,
    alertSpikeStdDev: 2,
    alertNewTool: true,
    ...overrides,
  };
}

function makeProject(
  overrides?: Partial<ProjectSnapshot>,
): ProjectSnapshot {
  return {
    projectId: "proj-1",
    projectName: "Test Project",
    aiRatio: 0.3,
    toolBreakdown: [],
    ...overrides,
  };
}

describe("detectAnomalies", () => {
  it("returns empty array when alerts are disabled", () => {
    const result = detectAnomalies(
      0.9,
      [makeProject()],
      makeConfig({ alertEnabled: false }),
      [0.1, 0.2, 0.3],
      [],
    );
    expect(result).toEqual([]);
  });

  it("detects threshold exceeded", () => {
    const result = detectAnomalies(
      0.7,
      [],
      makeConfig({ alertMaxRatio: 0.5 }),
      [],
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("threshold_exceeded");
    expect(result[0].severity).toBe("critical");
    expect(result[0].detail).toContain("70.0%");
    expect(result[0].detail).toContain("50.0%");
  });

  it("does not alert when below threshold", () => {
    const result = detectAnomalies(
      0.3,
      [],
      makeConfig({ alertMaxRatio: 0.5 }),
      [],
    );
    const thresholdAlerts = result.filter(
      (a) => a.type === "threshold_exceeded",
    );
    expect(thresholdAlerts).toHaveLength(0);
  });

  it("detects spike in project", () => {
    // history: [0.1, 0.1, 0.1] → mean=0.1, stddev=0, threshold=0.1
    // project with 0.5 is a spike
    const project = makeProject({ aiRatio: 0.5 });
    const result = detectAnomalies(
      0.1,
      [project],
      makeConfig({ alertMaxRatio: null, alertSpikeStdDev: 2, alertNewTool: false }),
      [0.1, 0.1, 0.1],
    );
    const spikes = result.filter((a) => a.type === "spike_detected");
    expect(spikes).toHaveLength(1);
    expect(spikes[0].severity).toBe("warning");
    expect(spikes[0].projectId).toBe("proj-1");
  });

  it("detects new tool", () => {
    const project = makeProject({
      toolBreakdown: [
        {
          tool: "new-ai-tool",
          confirmedFiles: 1,
          estimatedFiles: 0,
          totalLoc: 100,
          percentage: 100,
        },
      ],
    });
    const result = detectAnomalies(
      0.1,
      [project],
      makeConfig({ alertMaxRatio: null, alertNewTool: true }),
      [],
      ["copilot", "claude"],
    );
    const newToolAlerts = result.filter((a) => a.type === "new_tool");
    expect(newToolAlerts).toHaveLength(1);
    expect(newToolAlerts[0].detail).toContain("new-ai-tool");
  });

  it("skips new tool alert when alertNewTool is false", () => {
    const project = makeProject({
      toolBreakdown: [
        {
          tool: "new-ai-tool",
          confirmedFiles: 1,
          estimatedFiles: 0,
          totalLoc: 100,
          percentage: 100,
        },
      ],
    });
    const result = detectAnomalies(
      0.1,
      [project],
      makeConfig({ alertMaxRatio: null, alertNewTool: false }),
      [],
      ["copilot"],
    );
    const newToolAlerts = result.filter((a) => a.type === "new_tool");
    expect(newToolAlerts).toHaveLength(0);
  });

  it("skips threshold check when alertMaxRatio is null", () => {
    const result = detectAnomalies(
      0.99,
      [],
      makeConfig({ alertMaxRatio: null, alertNewTool: false }),
      [],
    );
    expect(result).toHaveLength(0);
  });
});
