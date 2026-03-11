import http from "node:http";
import { Redis } from "ioredis";
import { EventBus, withRetry } from "@sentinel/events";
import { getDb, disconnectDb } from "@sentinel/db";
import {
  HttpWebhookAdapter,
  SlackAdapter,
  PagerDutyAdapter,
  AdapterRegistry,
  TopicTrie,
  type NotificationEvent,
} from "@sentinel/notifications";
import { createLogger, initTracing, shutdownTracing } from "@sentinel/telemetry";

const logger = createLogger({ name: "notification-worker" });

// --- Retry scheduling ---

function computeNextRetry(attempt: number): Date {
  const base = 5_000;
  const jitter = Math.random() * 5_000;
  const maxDelay = 3_600_000;
  const delay = Math.min(base * Math.pow(2, attempt) + jitter, maxDelay);
  return new Date(Date.now() + delay);
}

// --- Core processing (exported for testing) ---

interface WorkerDeps {
  db: any;
  registry: AdapterRegistry;
  redisPub?: any;
}

export async function processNotificationEvent(
  event: NotificationEvent,
  deps: WorkerDeps,
): Promise<void> {
  // Publish to Redis for SSE fan-out
  if (deps.redisPub) {
    await deps.redisPub.publish("sentinel.events.fanout", JSON.stringify(event));
  }

  // Find matching endpoints
  const endpoints = await deps.db.webhookEndpoint.findMany({
    where: { orgId: event.orgId, enabled: true },
  });

  // Build trie for this org's endpoints and match
  const trie = new TopicTrie<string>();
  const endpointMap = new Map<string, typeof endpoints[0]>();
  for (const ep of endpoints) {
    if (!ep.enabled) continue; // Belt-and-suspenders: skip disabled even if DB missed filter
    endpointMap.set(ep.id, ep);
    for (const topic of ep.topics) {
      trie.add(topic, ep.id);
    }
  }

  const matchedIds = trie.match(event.topic);

  for (const epId of matchedIds) {
    const ep = endpointMap.get(epId);
    if (!ep) continue;

    const adapter = deps.registry.get(ep.channelType);
    if (!adapter) continue;

    const result = await adapter.deliver(ep, event);

    if (result.success) {
      await deps.db.webhookDelivery.create({
        data: {
          endpointId: ep.id, orgId: event.orgId, topic: event.topic,
          payload: event, status: "delivered",
          httpStatus: result.httpStatus ?? null, attempt: 1, deliveredAt: new Date(),
        },
      });
    } else {
      await deps.db.webhookDelivery.create({
        data: {
          endpointId: ep.id, orgId: event.orgId, topic: event.topic,
          payload: event, status: "pending",
          httpStatus: result.httpStatus ?? null, attempt: 1,
          lastError: result.error ?? null, nextRetryAt: computeNextRetry(1),
        },
      });
    }
  }

  // Also process notification rules
  const rules = await deps.db.notificationRule.findMany({
    where: { orgId: event.orgId, enabled: true },
  });

  const ruleTrie = new TopicTrie<string>();
  const ruleMap = new Map<string, typeof rules[0]>();
  for (const rule of rules) {
    ruleMap.set(rule.id, rule);
    for (const topic of rule.topics) {
      ruleTrie.add(topic, rule.id);
    }
  }

  const matchedRuleIds = ruleTrie.match(event.topic);
  for (const ruleId of matchedRuleIds) {
    const rule = ruleMap.get(ruleId);
    if (!rule) continue;
    const adapter = deps.registry.get(rule.channelType);
    if (!adapter) continue;
    await adapter.deliver(rule, event);
  }
}

export async function processRetryQueue(deps: WorkerDeps): Promise<void> {
  const pendingDeliveries = await deps.db.webhookDelivery.findMany({
    where: { status: "pending", nextRetryAt: { lte: new Date() } },
    take: 50,
  });

  if (pendingDeliveries.length === 0) return;

  const epIds = [...new Set(pendingDeliveries.map((d: any) => d.endpointId))];
  const endpoints = await deps.db.webhookEndpoint.findMany({ where: { id: { in: epIds } } });
  const epMap = new Map<string, any>(endpoints.map((ep: any) => [ep.id, ep]));

  for (const delivery of pendingDeliveries) {
    const ep = epMap.get(delivery.endpointId);
    if (!ep) continue;

    const adapter = deps.registry.get(ep.channelType);
    if (!adapter) continue;

    const event: NotificationEvent = delivery.payload as NotificationEvent;
    const result = await adapter.deliver(ep, event);

    if (result.success) {
      await deps.db.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "delivered", httpStatus: result.httpStatus ?? null, attempt: delivery.attempt + 1, deliveredAt: new Date(), lastError: null, nextRetryAt: null },
      });
    } else if (delivery.attempt >= delivery.maxAttempts) {
      await deps.db.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "dlq", attempt: delivery.attempt + 1, lastError: result.error ?? null, nextRetryAt: null },
      });
    } else {
      await deps.db.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "pending", attempt: delivery.attempt + 1, lastError: result.error ?? null, nextRetryAt: computeNextRetry(delivery.attempt + 1) },
      });
    }
  }
}

// --- Main process (only when executed directly) ---

if (process.env.NODE_ENV !== "test") {
  initTracing({ serviceName: "notification-worker" });

  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const redisPub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const eventBus = new EventBus(redis);
  const db = getDb();

  const registry = new AdapterRegistry();
  registry.register(new HttpWebhookAdapter());
  registry.register(new SlackAdapter());
  registry.register(new PagerDutyAdapter());

  const wrappedHandler = withRetry(redis, "sentinel.notifications", async (_id: string, data: Record<string, unknown>) => {
    const event = data as unknown as NotificationEvent;
    await processNotificationEvent(event, { db, registry, redisPub });
  }, { maxRetries: 3, baseDelayMs: 1000 });

  eventBus.subscribe("sentinel.notifications", "notification-workers", `notif-${process.pid}`, wrappedHandler);

  const retryInterval = setInterval(async () => {
    try { await processRetryQueue({ db, registry }); } catch (err) { logger.error({ err }, "Retry queue processing failed"); }
  }, 5_000);

  const healthPort = parseInt(process.env.NOTIFICATION_WORKER_PORT ?? "9095", 10);
  const healthServer = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    } else { res.writeHead(404); res.end(); }
  });
  healthServer.listen(healthPort);
  logger.info({ port: healthPort }, "Notification worker health server listening");

  const shutdown = async () => {
    clearInterval(retryInterval);
    healthServer.close();
    logger.info("Notification worker shutting down...");
    await eventBus.disconnect();
    redisPub.disconnect();
    await shutdownTracing();
    await disconnectDb();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Notification worker started — consuming sentinel.notifications");
}
