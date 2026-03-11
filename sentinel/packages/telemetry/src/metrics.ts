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

// --- P7: Notification metrics ---

export const notificationDeliveriesTotal = new Counter({
  name: "sentinel_notification_deliveries_total",
  help: "Total notification deliveries by channel and status",
  labelNames: ["channel", "status"] as const,
  registers: [registry],
});

export const notificationDeliveryDuration = new Histogram({
  name: "sentinel_notification_delivery_duration_seconds",
  help: "Notification delivery duration in seconds",
  labelNames: ["channel", "success"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const sseConnectionsGauge = new Gauge({
  name: "sentinel_sse_connections",
  help: "Number of active SSE connections",
  labelNames: ["org_id"] as const,
  registers: [registry],
});

export const notificationRetryQueueDepth = new Gauge({
  name: "sentinel_notification_retry_queue_depth",
  help: "Number of pending notification deliveries awaiting retry",
  registers: [registry],
});
