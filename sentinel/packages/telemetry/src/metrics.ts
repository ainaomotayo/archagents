import {
  Registry,
  collectDefaultMetrics,
  Histogram,
  Counter,
  Gauge,
} from "prom-client";

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new Histogram({
  name: "sentinel_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const scanDuration = new Histogram({
  name: "sentinel_scan_duration_seconds",
  help: "End-to-end scan processing time",
  labelNames: ["status"] as const,
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [registry],
});

export const findingsTotal = new Counter({
  name: "sentinel_findings_total",
  help: "Total number of findings produced",
  labelNames: ["severity", "agent"] as const,
  registers: [registry],
});

export const agentResultsTotal = new Counter({
  name: "sentinel_agent_results_total",
  help: "Agent results received",
  labelNames: ["agent", "status"] as const,
  registers: [registry],
});

export const pendingScansGauge = new Gauge({
  name: "sentinel_pending_scans",
  help: "Number of scans awaiting agent results",
  registers: [registry],
});

export const dlqDepthGauge = new Gauge({
  name: "sentinel_dlq_depth",
  help: "Number of messages in the dead-letter queue",
  registers: [registry],
});
