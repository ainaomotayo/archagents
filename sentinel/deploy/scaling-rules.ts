/**
 * Auto-scaling rules and configuration for SENTINEL services.
 */

export interface ScalingMetrics {
  cpu: number; // percentage 0-100
  memory: number; // percentage 0-100
  queueDepth: number; // number of items in queue
}

export interface ScalingRule {
  service: string;
  minReplicas: number;
  maxReplicas: number;
  targetCpu: number; // percentage
  targetMemory: number; // percentage
  scaleUpThreshold: number; // queue depth to trigger scale-up
  scaleDownThreshold: number; // queue depth below which to scale-down
  cooldownSeconds: number;
}

export const AGENT_SCALING_RULES: ScalingRule[] = [
  {
    service: "security-agent",
    minReplicas: 1,
    maxReplicas: 10,
    targetCpu: 70,
    targetMemory: 80,
    scaleUpThreshold: 50,
    scaleDownThreshold: 5,
    cooldownSeconds: 60,
  },
  {
    service: "license-agent",
    minReplicas: 1,
    maxReplicas: 8,
    targetCpu: 70,
    targetMemory: 80,
    scaleUpThreshold: 40,
    scaleDownThreshold: 5,
    cooldownSeconds: 60,
  },
  {
    service: "quality-agent",
    minReplicas: 1,
    maxReplicas: 8,
    targetCpu: 70,
    targetMemory: 80,
    scaleUpThreshold: 40,
    scaleDownThreshold: 5,
    cooldownSeconds: 60,
  },
  {
    service: "ai-detection-agent",
    minReplicas: 1,
    maxReplicas: 6,
    targetCpu: 75,
    targetMemory: 85,
    scaleUpThreshold: 30,
    scaleDownThreshold: 3,
    cooldownSeconds: 90,
  },
  {
    service: "pii-scrubber",
    minReplicas: 1,
    maxReplicas: 6,
    targetCpu: 70,
    targetMemory: 80,
    scaleUpThreshold: 30,
    scaleDownThreshold: 3,
    cooldownSeconds: 60,
  },
  {
    service: "policy-agent",
    minReplicas: 1,
    maxReplicas: 4,
    targetCpu: 60,
    targetMemory: 70,
    scaleUpThreshold: 20,
    scaleDownThreshold: 2,
    cooldownSeconds: 120,
  },
  {
    service: "llm-review-agent",
    minReplicas: 1,
    maxReplicas: 5,
    targetCpu: 80,
    targetMemory: 85,
    scaleUpThreshold: 20,
    scaleDownThreshold: 2,
    cooldownSeconds: 120,
  },
  {
    service: "orchestrator",
    minReplicas: 2,
    maxReplicas: 6,
    targetCpu: 60,
    targetMemory: 70,
    scaleUpThreshold: 100,
    scaleDownThreshold: 10,
    cooldownSeconds: 60,
  },
];

/**
 * Determines whether a service should scale up based on current metrics.
 * A scale-up is triggered when CPU, memory, or queue depth exceeds thresholds.
 */
export function shouldScaleUp(
  rule: ScalingRule,
  metrics: ScalingMetrics,
): boolean {
  return (
    metrics.cpu > rule.targetCpu ||
    metrics.memory > rule.targetMemory ||
    metrics.queueDepth > rule.scaleUpThreshold
  );
}

/**
 * Determines whether a service should scale down based on current metrics.
 * A scale-down is triggered when ALL metrics are below their respective thresholds.
 */
export function shouldScaleDown(
  rule: ScalingRule,
  metrics: ScalingMetrics,
): boolean {
  return (
    metrics.cpu < rule.targetCpu * 0.5 &&
    metrics.memory < rule.targetMemory * 0.5 &&
    metrics.queueDepth < rule.scaleDownThreshold
  );
}

/**
 * Calculates the desired number of replicas given current metrics.
 * Uses the highest ratio among CPU, memory, and queue-based scaling to
 * determine the new replica count, clamped to [minReplicas, maxReplicas].
 */
export function calculateDesiredReplicas(
  rule: ScalingRule,
  currentReplicas: number,
  metrics: ScalingMetrics,
): number {
  if (shouldScaleDown(rule, metrics)) {
    const desired = Math.max(currentReplicas - 1, rule.minReplicas);
    return desired;
  }

  if (!shouldScaleUp(rule, metrics)) {
    return currentReplicas;
  }

  // Scale based on the most constrained resource
  const cpuRatio = metrics.cpu / rule.targetCpu;
  const memoryRatio = metrics.memory / rule.targetMemory;
  const queueRatio =
    rule.scaleUpThreshold > 0
      ? metrics.queueDepth / rule.scaleUpThreshold
      : 1;

  const maxRatio = Math.max(cpuRatio, memoryRatio, queueRatio);
  const desired = Math.ceil(currentReplicas * maxRatio);

  return Math.min(Math.max(desired, rule.minReplicas), rule.maxReplicas);
}
