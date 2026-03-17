import { createHash } from "node:crypto";
import { Redis } from "ioredis";
import { EventBus, withRetry } from "@sentinel/events";
import { getDb, disconnectDb } from "@sentinel/db";
import {
  HttpWebhookAdapter,
  SlackAdapter,
  PagerDutyAdapter,
  EmailAdapter,
  AdapterRegistry,
  TopicTrie,
  type NotificationEvent,
} from "@sentinel/notifications";
import { buildDigestEmailHtml } from "@sentinel/compliance";
import { createLogger, initTracing, shutdownTracing } from "@sentinel/telemetry";
import {
  notificationDeliveriesTotal,
  notificationDeliveryDuration,
  notificationRetryQueueDepth,
} from "@sentinel/telemetry";
import { createWorkerHealthServer } from "./worker-metrics.js";

const logger = createLogger({ name: "notification-worker" });

// --- Retry scheduling ---

function computeNextRetry(attempt: number): Date {
  const base = 5_000;
  const jitter = Math.random() * 5_000;
  const maxDelay = 3_600_000;
  const delay = Math.min(base * Math.pow(2, attempt) + jitter, maxDelay);
  return new Date(Date.now() + delay);
}

function computeIdempotencyKey(eventId: string, endpointId: string): string {
  return createHash("sha256").update(`${eventId}:${endpointId}`).digest("hex");
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

    const idempotencyKey = computeIdempotencyKey(event.id, ep.id);

    // Check for existing delivery (deduplication on restart)
    const existing = await deps.db.webhookDelivery.findUnique({
      where: { idempotencyKey },
    });
    if (existing) continue;

    const result = await adapter.deliver(ep, event);

    if (result.success) {
      await deps.db.webhookDelivery.create({
        data: {
          idempotencyKey,
          endpointId: ep.id, orgId: event.orgId, topic: event.topic,
          payload: event, status: "delivered",
          httpStatus: result.httpStatus ?? null, attempt: 1, deliveredAt: new Date(),
        },
      });
      notificationDeliveriesTotal.inc({ channel: ep.channelType, status: "delivered" });
      notificationDeliveryDuration.observe({ channel: ep.channelType, success: "true" }, result.durationMs / 1000);
    } else {
      await deps.db.webhookDelivery.create({
        data: {
          idempotencyKey,
          endpointId: ep.id, orgId: event.orgId, topic: event.topic,
          payload: event, status: "pending",
          httpStatus: result.httpStatus ?? null, attempt: 1,
          lastError: result.error ?? null, nextRetryAt: computeNextRetry(1),
        },
      });
      notificationDeliveriesTotal.inc({ channel: ep.channelType, status: "failed" });
      notificationDeliveryDuration.observe({ channel: ep.channelType, success: "false" }, result.durationMs / 1000);
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
      notificationDeliveriesTotal.inc({ channel: ep.channelType, status: "delivered" });
    } else if (delivery.attempt >= delivery.maxAttempts) {
      await deps.db.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "dlq", attempt: delivery.attempt + 1, lastError: result.error ?? null, nextRetryAt: null },
      });
      notificationDeliveriesTotal.inc({ channel: ep.channelType, status: "dlq" });
    } else {
      await deps.db.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "pending", attempt: delivery.attempt + 1, lastError: result.error ?? null, nextRetryAt: computeNextRetry(delivery.attempt + 1) },
      });
    }
  }

  const retryDepth = await deps.db.webhookDelivery.count({ where: { status: "pending" } });
  notificationRetryQueueDepth.set(retryDepth);

  // Check DLQ depth and emit system event if threshold exceeded
  const dlqCount = await deps.db.webhookDelivery.count({ where: { status: "dlq" } });
  if (dlqCount > 100 && deps.redisPub) {
    await deps.redisPub.publish("sentinel.events.fanout", JSON.stringify({
      id: `evt-dlq-threshold-${Date.now()}`,
      orgId: "system",
      topic: "system.dlq_threshold",
      payload: { stream: "sentinel.notifications", depth: dlqCount, threshold: 100 },
      timestamp: new Date().toISOString(),
    }));
  }
}

export async function handleDigestEvent(
  event: NotificationEvent,
  deps: WorkerDeps & { dashboardUrl: string },
): Promise<void> {
  const { scheduleId, recipients, parameters } = event.payload as any;
  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) return;

  // Read today's digest snapshot
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let snapshot = await deps.db.digestSnapshot.findFirst({
    where: { orgId: event.orgId, snapshotDate: today },
  });

  if (!snapshot) {
    // Fallback: try yesterday
    const yesterday = new Date(today.getTime() - 86400000);
    snapshot = await deps.db.digestSnapshot.findFirst({
      where: { orgId: event.orgId, snapshotDate: yesterday },
    });
    if (!snapshot) return; // No snapshot available
  }

  const orgName = parameters?.orgName ?? event.orgId;
  const html = buildDigestEmailHtml(orgName, snapshot.metrics, deps.dashboardUrl);

  const emailAdapter = deps.registry.get("email");
  if (!emailAdapter) return;

  for (const recipient of recipients) {
    await emailAdapter.deliver(
      { channelType: "email", channelConfig: { to: [recipient], subject: "SENTINEL Weekly Digest — {{topic}}" } } as any,
      { ...event, topic: "compliance.digest" },
    );
  }

  // Update schedule status
  if (scheduleId) {
    await deps.db.reportSchedule.update({
      where: { id: scheduleId },
      data: { lastStatus: "delivered" },
    }).catch(() => {});
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

  // Register email adapter if SMTP is configured
  if (process.env.SMTP_HOST) {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS ?? "",
      } : undefined,
    });
    registry.register(new EmailAdapter(transporter));
    logger.info({ host: process.env.SMTP_HOST }, "Email adapter registered");
  }

  const dashboardUrl = process.env.DASHBOARD_URL ?? "https://sentinel.example.com";
  const wrappedHandler = withRetry(redis, "sentinel.notifications", async (_id: string, data: Record<string, unknown>) => {
    const event = data as unknown as NotificationEvent;
    if (event.topic === "compliance.digest_ready") {
      await handleDigestEvent(event, { db, registry, redisPub, dashboardUrl });
    } else if (event.topic === "compliance.report_ready" && event.payload?.delivery === "email") {
      const { reportId, type, storageKey, fileSize } = event.payload;
      if (storageKey) {
        const { createReportStorage } = await import("./report-storage-factory.js");
        const reportStorage = createReportStorage();
        const downloadUrl = await reportStorage.getSignedUrl(String(storageKey), 7 * 24 * 3600);
        const sizeMB = typeof fileSize === "number" ? (fileSize / (1024 * 1024)).toFixed(1) : "unknown";

        // Look up the report and requesting user's email
        const report = await db.report.findUnique({ where: { id: String(reportId) } });
        let recipientEmail: string | undefined;
        if (report?.requestedBy) {
          const user = await db.user.findUnique({ where: { id: report.requestedBy }, select: { email: true } });
          recipientEmail = user?.email;
        }

        if (!recipientEmail) {
          logger.warn({ reportId }, "No recipient email found for report delivery");
        } else {
          const emailAdapter = registry.get("email");
          if (emailAdapter) {
            const reportEvent: NotificationEvent = {
              id: `${event.id}-email`,
              orgId: event.orgId,
              topic: "compliance.report_ready",
              timestamp: event.timestamp,
              payload: {
                "Report Type": String(type).replace(/_/g, " "),
                "Report ID": String(reportId),
                "Download Link": downloadUrl,
                "File Size": `${sizeMB} MB`,
                "Link Expires": "7 days",
              },
            };
            await emailAdapter.deliver(
              {
                channelType: "email",
                channelConfig: {
                  to: [recipientEmail],
                  subject: "SENTINEL Report Ready: {{topic}}",
                },
              } as any,
              reportEvent,
            );
            logger.info({ reportId, type, recipientEmail, sizeMB }, "Report email delivered");
          } else {
            logger.warn({ reportId }, "Email adapter not configured — skipping email delivery");
          }
        }
      }
    } else {
      await processNotificationEvent(event, { db, registry, redisPub });
    }
  }, { maxRetries: 3, baseDelayMs: 1000 });

  eventBus.subscribe("sentinel.notifications", "notification-workers", `notif-${process.pid}`, wrappedHandler);

  const retryInterval = setInterval(async () => {
    try { await processRetryQueue({ db, registry, redisPub }); } catch (err) { logger.error({ err }, "Retry queue processing failed"); }
  }, 5_000);

  const healthPort = parseInt(process.env.NOTIFICATION_WORKER_PORT ?? "9095", 10);
  const healthServer = createWorkerHealthServer(healthPort);
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
