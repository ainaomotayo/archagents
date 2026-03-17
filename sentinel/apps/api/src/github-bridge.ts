import { Redis } from "ioredis";
import { EventBus, withRetry } from "@sentinel/events";
import { getDb, disconnectDb } from "@sentinel/db";
import { configureGitHubApp, getInstallationOctokit, isGitHubAppConfigured } from "@sentinel/github";
import { createLogger, initTracing, shutdownTracing } from "@sentinel/telemetry";
import { handleScanTrigger } from "./github/trigger-consumer.js";
import { handleScanResult } from "./github/results-consumer.js";
import { createWorkerHealthServer } from "./worker-metrics.js";

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  initTracing({ serviceName: "github-bridge" });
}

const logger = createLogger({ name: "github-bridge" });

// --- Configuration ---

if (process.env.GITHUB_APP_ID && process.env.GITHUB_PRIVATE_KEY) {
  configureGitHubApp({
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_PRIVATE_KEY,
  });
}

if (!isGitHubAppConfigured()) {
  logger.error("GITHUB_APP_ID and GITHUB_PRIVATE_KEY are required for github-bridge");
  process.exit(1);
}

// --- Infrastructure ---

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const redis = new Redis(redisUrl);
const db = getDb();

// Two separate EventBus instances — each subscribe() is a blocking loop
const triggerBus = new EventBus(new Redis(redisUrl));
const resultsBus = new EventBus(new Redis(redisUrl));

// Shared EventBus for publishing (non-blocking)
const publishBus = new EventBus(new Redis(redisUrl));

// --- Health server (also serves /metrics for Prometheus) ---

const healthPort = parseInt(process.env.GITHUB_BRIDGE_PORT ?? "9092", 10);
const healthServer = createWorkerHealthServer(healthPort);
logger.info({ port: healthPort }, "Health server listening");

// --- Consumer 1: scan-triggers ---

const triggerHandler = withRetry(redis, "sentinel.scan-triggers", async (_id, data) => {
  await handleScanTrigger(data as any, {
    redis,
    db,
    publishBus,
    getOctokit: getInstallationOctokit,
  });
}, { maxRetries: 3, baseDelayMs: 2000 });

triggerBus.subscribe(
  "sentinel.scan-triggers",
  "github-bridge",
  `bridge-triggers-${process.pid}`,
  triggerHandler,
);

logger.info("Consuming sentinel.scan-triggers...");

// --- Consumer 2: sentinel.results ---

const resultsHandler = withRetry(redis, "sentinel.results", async (_id, data) => {
  await handleScanResult(data as any, {
    redis,
    db,
    getOctokit: getInstallationOctokit,
  });
}, { maxRetries: 3, baseDelayMs: 2000 });

resultsBus.subscribe(
  "sentinel.results",
  "github-bridge",
  `bridge-results-${process.pid}`,
  resultsHandler,
);

logger.info("Consuming sentinel.results...");

// --- Graceful shutdown ---

const shutdown = async () => {
  logger.info("GitHub bridge shutting down...");
  healthServer.close();
  await triggerBus.disconnect();
  await resultsBus.disconnect();
  await publishBus.disconnect();
  redis.disconnect();
  await shutdownTracing();
  await disconnectDb();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

logger.info("GitHub bridge started");
