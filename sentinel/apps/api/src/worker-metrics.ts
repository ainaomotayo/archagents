import http from "node:http";
import client from "prom-client";

export const workerRegistry = new client.Registry();
client.collectDefaultMetrics({ register: workerRegistry, prefix: "sentinel_worker_" });

export const workerEventsProcessed = new client.Counter({
  name: "sentinel_worker_events_processed_total",
  help: "Total events processed by worker",
  labelNames: ["worker", "status"],
  registers: [workerRegistry],
});

export const workerProcessingDuration = new client.Histogram({
  name: "sentinel_worker_processing_duration_seconds",
  help: "Event processing duration in seconds",
  labelNames: ["worker"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10, 30],
  registers: [workerRegistry],
});

export const workerConsumerLag = new client.Gauge({
  name: "sentinel_worker_stream_consumer_lag",
  help: "Number of pending messages in consumer group",
  labelNames: ["worker", "stream"],
  registers: [workerRegistry],
});

export const workerBatchSize = new client.Histogram({
  name: "sentinel_worker_batch_size",
  help: "Number of events processed per batch",
  labelNames: ["worker"],
  buckets: [1, 2, 5, 10, 20, 50, 100],
  registers: [workerRegistry],
});

/**
 * Creates an HTTP health server that also serves /metrics for Prometheus.
 * Drop-in replacement for the bare http.createServer pattern used by workers.
 */
export function createWorkerHealthServer(port: number): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    } else if (req.url === "/metrics") {
      try {
        const metrics = await workerRegistry.metrics();
        res.writeHead(200, { "Content-Type": workerRegistry.contentType });
        res.end(metrics);
      } catch {
        res.writeHead(500);
        res.end();
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(port);
  return server;
}
