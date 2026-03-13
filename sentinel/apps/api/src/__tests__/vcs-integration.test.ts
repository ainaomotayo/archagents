import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { VcsProviderRegistry } from "@sentinel/vcs";
import type { VcsProvider, VcsProviderType } from "@sentinel/vcs";
import { registerVcsWebhookRoutes } from "../routes/vcs-webhooks.js";

function createMockProvider(type: VcsProviderType): VcsProvider {
  return {
    name: type,
    type,
    capabilities: {
      checkRuns: type === "github",
      commitStatus: true,
      prComments: true,
      prAnnotations: type === "github",
      webhookSignatureVerification: true,
      appInstallations: type === "github",
    },
    verifyWebhook: vi.fn().mockResolvedValue(true),
    parseWebhook: vi.fn().mockResolvedValue({
      provider: type,
      type: "push",
      installationId: `inst-${type}`,
      repo: `owner/repo-${type}`,
      owner: "owner",
      commitHash: "abc123",
      branch: "main",
      author: "dev@example.com",
    }),
    fetchDiff: vi.fn().mockResolvedValue({ rawDiff: "diff", files: [] }),
    reportStatus: vi.fn().mockResolvedValue(undefined),
    getInstallationToken: vi.fn().mockResolvedValue("token"),
  };
}

const providers: VcsProviderType[] = ["github", "gitlab", "bitbucket", "azure_devops"];
const slugMap: Record<VcsProviderType, string> = {
  github: "github",
  gitlab: "gitlab",
  bitbucket: "bitbucket",
  azure_devops: "azure-devops",
};

describe("Multi-VCS integration", () => {
  // Test: accepts webhooks from each of the 4 providers (parameterized)
  for (const providerType of providers) {
    it(`accepts webhooks from ${providerType}`, async () => {
      const registry = new VcsProviderRegistry();
      const mockProvider = createMockProvider(providerType);
      registry.register(mockProvider);

      const mockEventBus = { publish: vi.fn().mockResolvedValue(undefined) };
      const mockDb = {
        vcsInstallation: {
          findFirst: vi.fn().mockResolvedValue({
            id: "inst-1", orgId: "org-1", provider: providerType, webhookSecret: "secret",
          }),
        },
      };

      const app = Fastify();
      registerVcsWebhookRoutes(app, { registry, eventBus: mockEventBus as any, db: mockDb });
      await app.ready();

      const res = await app.inject({
        method: "POST",
        url: `/webhooks/${slugMap[providerType]}`,
        payload: { test: true },
      });

      expect(res.statusCode).toBe(202);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        "sentinel.scan-triggers",
        expect.objectContaining({ provider: providerType, orgId: "org-1" }),
      );
    });
  }

  // Test: all 4 providers can be registered simultaneously
  it("all 4 providers can be registered simultaneously", () => {
    const registry = new VcsProviderRegistry();
    for (const type of providers) {
      registry.register(createMockProvider(type));
    }
    expect(registry.list().sort()).toEqual([...providers].sort());
  });

  // Test: scan trigger event preserves provider field through pipeline
  it("scan trigger preserves provider field through pipeline", async () => {
    const registry = new VcsProviderRegistry();
    registry.register(createMockProvider("gitlab"));

    const mockEventBus = { publish: vi.fn().mockResolvedValue(undefined) };
    const mockDb = {
      vcsInstallation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "inst-1", orgId: "org-1", provider: "gitlab", webhookSecret: "secret",
        }),
      },
    };

    const app = Fastify();
    registerVcsWebhookRoutes(app, { registry, eventBus: mockEventBus as any, db: mockDb });
    await app.ready();

    await app.inject({ method: "POST", url: "/webhooks/gitlab", payload: {} });

    const publishCall = mockEventBus.publish.mock.calls[0];
    expect(publishCall[0]).toBe("sentinel.scan-triggers");
    expect(publishCall[1].provider).toBe("gitlab");
  });
});
