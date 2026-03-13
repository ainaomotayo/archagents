import type { FastifyInstance } from "fastify";
import type { EventBus } from "@sentinel/events";
import type { VcsProviderRegistry, VcsProviderType } from "@sentinel/vcs";

interface VcsWebhookOpts {
  registry: VcsProviderRegistry;
  eventBus: EventBus;
  db: any;
}

/** Map URL slug to provider type */
function slugToType(slug: string): VcsProviderType | undefined {
  const map: Record<string, VcsProviderType> = {
    github: "github",
    gitlab: "gitlab",
    bitbucket: "bitbucket",
    "azure-devops": "azure_devops",
  };
  return map[slug];
}

export function registerVcsWebhookRoutes(
  app: FastifyInstance,
  opts: VcsWebhookOpts,
): void {
  app.post<{ Params: { provider: string } }>(
    "/webhooks/:provider",
    { config: { rateLimit: false } },
    async (request, reply) => {
      const providerType = slugToType(request.params.provider);
      if (!providerType || !opts.registry.has(providerType)) {
        reply.code(404).send({ error: "Unknown VCS provider" });
        return;
      }

      const provider = opts.registry.get(providerType)!;
      const rawBody = typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body);

      // Look up VCS installation for webhook secret
      const installation = await opts.db.vcsInstallation.findFirst({
        where: { provider: providerType, active: true },
      });

      const secret = installation?.webhookSecret ?? "";

      const event = {
        provider: providerType,
        headers: request.headers as Record<string, string>,
        body: typeof request.body === "string" ? JSON.parse(request.body) : request.body,
        rawBody,
      };

      if (!installation) {
        reply.code(404).send({ error: "Unknown VCS installation" });
        return;
      }

      if (!(await provider.verifyWebhook(event, secret))) {
        reply.code(401).send({ error: "Invalid webhook signature" });
        return;
      }

      const trigger = await provider.parseWebhook(event);
      if (!trigger) {
        reply.code(200).send({ ignored: true });
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
    },
  );
}
