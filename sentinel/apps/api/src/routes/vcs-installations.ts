import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@sentinel/db";

interface VcsInstallationsOpts {
  db: PrismaClient;
}

export function registerVcsInstallationRoutes(
  app: FastifyInstance,
  opts: VcsInstallationsOpts,
): void {
  // List installations for current org
  app.get("/v1/vcs-installations", async (request, reply) => {
    const orgId = (request as any).orgId;
    if (!orgId) return reply.code(401).send({ error: "Unauthorized" });

    const installations = await opts.db.vcsInstallation.findMany({
      where: { orgId },
      include: {
        githubExt: true,
        gitlabExt: true,
        bitbucketExt: true,
        azureDevOpsExt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    reply.send({ installations });
  });

  // Create new installation
  app.post("/v1/vcs-installations", async (request, reply) => {
    const orgId = (request as any).orgId;
    if (!orgId) return reply.code(401).send({ error: "Unauthorized" });

    const body = request.body as any;
    const { provider, installationId, owner, webhookSecret, ...providerConfig } = body;

    if (!provider || !installationId || !owner) {
      return reply.code(400).send({ error: "provider, installationId, and owner are required" });
    }

    const installation = await opts.db.vcsInstallation.create({
      data: {
        orgId,
        provider,
        installationId,
        owner,
        webhookSecret: webhookSecret ?? "",
        active: true,
        metadata: {},
        ...(provider === "github" && providerConfig.appId
          ? {
              githubExt: {
                create: {
                  appId: providerConfig.appId,
                  numericInstallId: parseInt(providerConfig.numericInstallId ?? "0", 10),
                  privateKey: providerConfig.privateKey ?? "",
                },
              },
            }
          : {}),
        ...(provider === "gitlab" && providerConfig.accessToken
          ? {
              gitlabExt: {
                create: {
                  gitlabUrl: providerConfig.gitlabUrl ?? "https://gitlab.com",
                  accessToken: providerConfig.accessToken,
                  tokenType: providerConfig.tokenType ?? "personal",
                },
              },
            }
          : {}),
        ...(provider === "bitbucket" && providerConfig.clientKey
          ? {
              bitbucketExt: {
                create: {
                  workspace: providerConfig.workspace ?? "",
                  clientKey: providerConfig.clientKey,
                  sharedSecret: providerConfig.sharedSecret ?? "",
                },
              },
            }
          : {}),
        ...(provider === "azure_devops" && providerConfig.organizationUrl
          ? {
              azureDevOpsExt: {
                create: {
                  organizationUrl: providerConfig.organizationUrl,
                  projectName: providerConfig.projectName ?? "",
                  pat: providerConfig.pat ?? "",
                },
              },
            }
          : {}),
      },
      include: {
        githubExt: true,
        gitlabExt: true,
        bitbucketExt: true,
        azureDevOpsExt: true,
      },
    });

    reply.code(201).send(installation);
  });

  // Update installation
  app.put<{ Params: { id: string } }>("/v1/vcs-installations/:id", async (request, reply) => {
    const orgId = (request as any).orgId;
    if (!orgId) return reply.code(401).send({ error: "Unauthorized" });

    const { id } = request.params;
    const body = request.body as any;

    const existing = await opts.db.vcsInstallation.findFirst({
      where: { id, orgId },
    });
    if (!existing) return reply.code(404).send({ error: "Not found" });

    const updated = await opts.db.vcsInstallation.update({
      where: { id },
      data: {
        active: body.active ?? existing.active,
        webhookSecret: body.webhookSecret ?? existing.webhookSecret,
        owner: body.owner ?? existing.owner,
      },
    });

    reply.send(updated);
  });

  // Delete installation
  app.delete<{ Params: { id: string } }>("/v1/vcs-installations/:id", async (request, reply) => {
    const orgId = (request as any).orgId;
    if (!orgId) return reply.code(401).send({ error: "Unauthorized" });

    const { id } = request.params;
    const existing = await opts.db.vcsInstallation.findFirst({
      where: { id, orgId },
    });
    if (!existing) return reply.code(404).send({ error: "Not found" });

    await opts.db.vcsInstallation.delete({ where: { id } });
    reply.code(204).send();
  });

  // Test connection
  app.post<{ Params: { id: string } }>("/v1/vcs-installations/:id/test", async (request, reply) => {
    const orgId = (request as any).orgId;
    if (!orgId) return reply.code(401).send({ error: "Unauthorized" });

    const { id } = request.params;
    const installation = await opts.db.vcsInstallation.findFirst({
      where: { id, orgId },
      include: { azureDevOpsExt: true, githubExt: true, gitlabExt: true, bitbucketExt: true },
    });
    if (!installation) return reply.code(404).send({ error: "Not found" });

    reply.send({ success: true, provider: installation.provider, owner: installation.owner });
  });

  // Provision webhooks on the VCS provider
  app.post<{ Params: { id: string } }>(
    "/v1/vcs-installations/:id/provision-webhooks",
    async (request, reply) => {
      const orgId = (request as any).orgId;
      if (!orgId) return reply.code(401).send({ error: "Unauthorized" });

      const { id } = request.params;
      const body = request.body as any;
      const callbackUrl = body.callbackUrl as string;
      if (!callbackUrl) {
        return reply.code(400).send({ error: "callbackUrl is required" });
      }

      const installation = await opts.db.vcsInstallation.findFirst({
        where: { id, orgId },
        include: { azureDevOpsExt: true },
      });
      if (!installation) return reply.code(404).send({ error: "Not found" });

      if (installation.provider === "azure_devops" && installation.azureDevOpsExt) {
        const { provisionAzureDevOpsHooks } = await import("../vcs/webhook-provisioner.js");
        const result = await provisionAzureDevOpsHooks(
          {
            organizationUrl: installation.azureDevOpsExt.organizationUrl,
            projectName: installation.azureDevOpsExt.projectName,
            pat: installation.azureDevOpsExt.pat,
          },
          callbackUrl,
        );
        return reply.send(result);
      }

      reply.code(400).send({ error: `Webhook provisioning not yet supported for ${installation.provider}` });
    },
  );
}
