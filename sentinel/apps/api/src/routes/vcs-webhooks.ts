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
  // Use Fastify encapsulation to scope the raw body parser to webhook routes only,
  // so the main app's JSON parser is unaffected.
  app.register(async (scope) => {
    // Parse JSON as raw string so we preserve the original wire bytes for HMAC verification.
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (_req, body, done) => {
        done(null, body);
      },
    );

    scope.post<{ Params: { provider: string } }>(
    "/webhooks/:provider",
    { config: { rateLimit: false } },
    async (request, reply) => {
      const providerType = slugToType(request.params.provider);
      if (!providerType || !opts.registry.has(providerType)) {
        reply.code(404).send({ error: "Unknown VCS provider" });
        return;
      }

      const provider = opts.registry.get(providerType)!;
      // request.body is the raw string from our content type parser above
      const rawBody = typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body);

      const event = {
        provider: providerType,
        headers: request.headers as Record<string, string>,
        body: typeof request.body === "string" ? JSON.parse(request.body) : request.body,
        rawBody,
      };

      // Parse first to extract owner/repo for installation lookup
      const trigger = await provider.parseWebhook(event);
      if (!trigger) {
        reply.code(200).send({ ignored: true });
        return;
      }

      // Look up VCS installation scoped to provider + owner for multi-tenant safety
      const installation = await opts.db.vcsInstallation.findFirst({
        where: { provider: providerType, owner: trigger.owner, active: true },
      });

      if (!installation) {
        reply.code(404).send({ error: "Unknown VCS installation" });
        return;
      }

      const secret = installation.webhookSecret ?? "";
      if (secret && !(await provider.verifyWebhook(event, secret))) {
        reply.code(401).send({ error: "Invalid webhook signature" });
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
  });
}
