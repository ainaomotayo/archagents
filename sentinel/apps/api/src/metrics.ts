import { FastifyInstance } from "fastify";
import client from "prom-client";

client.collectDefaultMetrics({ prefix: "sentinel_api_" });

export const httpRequestDuration = new client.Histogram({
  name: "sentinel_api_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const httpRequestsTotal = new client.Counter({
  name: "sentinel_api_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status_code"],
});

export const activeConnections = new client.Gauge({
  name: "sentinel_api_active_connections",
  help: "Number of active connections",
});

export const dbQueryDuration = new client.Histogram({
  name: "sentinel_api_db_query_duration_seconds",
  help: "Database query duration",
  labelNames: ["operation", "table"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
});

export const redisStreamDepth = new client.Gauge({
  name: "sentinel_api_redis_stream_depth",
  help: "Number of pending messages in Redis stream",
  labelNames: ["stream", "group"],
});

export const certificatesIssued = new client.Counter({
  name: "sentinel_api_certificates_issued_total",
  help: "Total certificates issued",
  labelNames: ["verdict"],
});

export const ssoAuthAttempts = new client.Counter({
  name: "sentinel_api_sso_auth_attempts_total",
  help: "SSO authentication attempts",
  labelNames: ["provider", "result", "reason"],
});

export const auditEventsEmitted = new client.Counter({
  name: "sentinel_api_audit_events_total",
  help: "Audit events emitted",
  labelNames: ["action", "actor"],
});

export function registerMetricsRoute(app: FastifyInstance) {
  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", client.register.contentType);
    return client.register.metrics();
  });
}
