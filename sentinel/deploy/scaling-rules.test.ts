import { describe, it, expect } from "vitest";
import {
  type ScalingRule,
  type ScalingMetrics,
  AGENT_SCALING_RULES,
  shouldScaleUp,
  shouldScaleDown,
  calculateDesiredReplicas,
} from "./scaling-rules.js";

const baseRule: ScalingRule = {
  service: "test-agent",
  minReplicas: 1,
  maxReplicas: 10,
  targetCpu: 70,
  targetMemory: 80,
  scaleUpThreshold: 50,
  scaleDownThreshold: 5,
  cooldownSeconds: 60,
};

describe("AGENT_SCALING_RULES", () => {
  it("defines rules for all expected services", () => {
    const services = AGENT_SCALING_RULES.map((r) => r.service);
    expect(services).toContain("security-agent");
    expect(services).toContain("license-agent");
    expect(services).toContain("quality-agent");
    expect(services).toContain("orchestrator");
    expect(services).toContain("llm-review-agent");
    expect(services.length).toBeGreaterThanOrEqual(6);
  });

  it("all rules have minReplicas >= 1", () => {
    for (const rule of AGENT_SCALING_RULES) {
      expect(rule.minReplicas).toBeGreaterThanOrEqual(1);
    }
  });

  it("all rules have maxReplicas > minReplicas", () => {
    for (const rule of AGENT_SCALING_RULES) {
      expect(rule.maxReplicas).toBeGreaterThan(rule.minReplicas);
    }
  });
});

describe("shouldScaleUp", () => {
  it("returns true when CPU exceeds target", () => {
    expect(shouldScaleUp(baseRule, { cpu: 80, memory: 50, queueDepth: 10 })).toBe(true);
  });

  it("returns true when memory exceeds target", () => {
    expect(shouldScaleUp(baseRule, { cpu: 50, memory: 90, queueDepth: 10 })).toBe(true);
  });

  it("returns true when queue depth exceeds threshold", () => {
    expect(shouldScaleUp(baseRule, { cpu: 30, memory: 40, queueDepth: 60 })).toBe(true);
  });

  it("returns false when all metrics are within range", () => {
    expect(shouldScaleUp(baseRule, { cpu: 50, memory: 60, queueDepth: 10 })).toBe(false);
  });
});

describe("shouldScaleDown", () => {
  it("returns true when all metrics are well below thresholds", () => {
    expect(shouldScaleDown(baseRule, { cpu: 10, memory: 20, queueDepth: 2 })).toBe(true);
  });

  it("returns false when CPU is above half the target", () => {
    expect(shouldScaleDown(baseRule, { cpu: 40, memory: 20, queueDepth: 2 })).toBe(false);
  });

  it("returns false when queue depth is above threshold", () => {
    expect(shouldScaleDown(baseRule, { cpu: 10, memory: 20, queueDepth: 10 })).toBe(false);
  });
});

describe("calculateDesiredReplicas", () => {
  it("scales up when CPU is high", () => {
    const metrics: ScalingMetrics = { cpu: 90, memory: 50, queueDepth: 10 };
    const result = calculateDesiredReplicas(baseRule, 3, metrics);
    expect(result).toBeGreaterThan(3);
  });

  it("scales down when all metrics are low", () => {
    const metrics: ScalingMetrics = { cpu: 10, memory: 10, queueDepth: 1 };
    const result = calculateDesiredReplicas(baseRule, 5, metrics);
    expect(result).toBe(4);
  });

  it("never goes below minReplicas", () => {
    const metrics: ScalingMetrics = { cpu: 5, memory: 5, queueDepth: 0 };
    const result = calculateDesiredReplicas(baseRule, 1, metrics);
    expect(result).toBe(baseRule.minReplicas);
  });

  it("never exceeds maxReplicas", () => {
    const metrics: ScalingMetrics = { cpu: 100, memory: 100, queueDepth: 1000 };
    const result = calculateDesiredReplicas(baseRule, 8, metrics);
    expect(result).toBeLessThanOrEqual(baseRule.maxReplicas);
  });

  it("holds steady when metrics are within range", () => {
    const metrics: ScalingMetrics = { cpu: 50, memory: 60, queueDepth: 10 };
    const result = calculateDesiredReplicas(baseRule, 3, metrics);
    expect(result).toBe(3);
  });

  it("scales based on queue depth", () => {
    const metrics: ScalingMetrics = { cpu: 30, memory: 30, queueDepth: 100 };
    const result = calculateDesiredReplicas(baseRule, 2, metrics);
    expect(result).toBeGreaterThan(2);
  });
});
