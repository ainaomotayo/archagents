import type { FastifyInstance } from "fastify";
import { parseWebhookEvent, verifyWebhookSignature } from "@sentinel/github";
import type { EventBus } from "@sentinel/events";

interface WebhookRouteOpts {
  eventBus: EventBus;
  webhookSecret: string;
  db: any;
}

export function registerWebhookRoutes(
  app: FastifyInstance,
  opts: WebhookRouteOpts,
): void {
  app.post("/webhooks/github", {
    config: { rateLimit: false },
  }, async (request, reply) => {
    const signature = request.headers["x-hub-signature-256"] as string;
    if (!signature) {
      reply.code(401).send({ error: "Missing X-Hub-Signature-256" });
      return;
    }

    const rawBody = typeof request.body === "string"
      ? request.body
      : JSON.stringify(request.body);

    if (!verifyWebhookSignature(rawBody, signature, opts.webhookSecret)) {
      reply.code(401).send({ error: "Invalid webhook signature" });
      return;
    }

    const eventType = request.headers["x-github-event"] as string;
    const payload = typeof request.body === "string"
      ? JSON.parse(request.body)
      : request.body;

    const trigger = parseWebhookEvent(eventType, payload);
    if (!trigger) {
      reply.code(200).send({ ignored: true });
      return;
    }

    const installation = await opts.db.gitHubInstallation.findUnique({
      where: { installationId: trigger.installationId },
    });

    if (!installation) {
      reply.code(404).send({ error: "Unknown GitHub installation" });
      return;
    }

    await opts.eventBus.publish("sentinel.scan-triggers", {
      ...trigger,
      orgId: installation.orgId,
    });

    reply.code(202).send({
      accepted: true,
      repo: trigger.repo,
      commit: trigger.commitHash,
    });
  });
}
