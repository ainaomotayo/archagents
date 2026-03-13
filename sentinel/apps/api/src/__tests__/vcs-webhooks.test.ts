import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { registerVcsWebhookRoutes } from "../routes/vcs-webhooks.js";

// Mock provider
const mockProvider = {
  name: "GitLab",
  type: "gitlab" as const,
  capabilities: {
    checkRuns: false,
    commitStatus: true,
    prComments: true,
    prAnnotations: false,
    webhookSignatureVerification: true,
    appInstallations: true,
  },
  verifyWebhook: vi.fn().mockResolvedValue(true),
  parseWebhook: vi.fn().mockResolvedValue({
    provider: "gitlab",
    type: "push",
    installationId: "123",
    repo: "group/repo",
    owner: "group",
    commitHash: "abc123",
    branch: "main",
    author: "dev@example.com",
  }),
  fetchDiff: vi.fn(),
  reportStatus: vi.fn(),
  getInstallationToken: vi.fn(),
};

const mockRegistry = {
  get: vi.fn().mockReturnValue(mockProvider),
  has: vi.fn().mockReturnValue(true),
  list: vi.fn().mockReturnValue(["gitlab"]),
  register: vi.fn(),
};

const mockEventBus = { publish: vi.fn().mockResolvedValue(undefined) };
const mockDb = {
  vcsInstallation: {
    findFirst: vi.fn().mockResolvedValue({
      id: "inst-1",
      orgId: "org-1",
      provider: "gitlab",
      webhookSecret: "my-secret",
      active: true,
    }),
  },
};

describe("VCS webhook routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistry.has.mockReturnValue(true);
    mockRegistry.get.mockReturnValue(mockProvider);
    mockProvider.verifyWebhook.mockResolvedValue(true);
    mockProvider.parseWebhook.mockResolvedValue({
      provider: "gitlab",
      type: "push",
      installationId: "123",
      repo: "group/repo",
      owner: "group",
      commitHash: "abc123",
      branch: "main",
      author: "dev@example.com",
    });
    mockDb.vcsInstallation.findFirst.mockResolvedValue({
      id: "inst-1",
      orgId: "org-1",
      provider: "gitlab",
      webhookSecret: "my-secret",
      active: true,
    });
  });

  async function buildApp() {
    const app = Fastify();
    registerVcsWebhookRoutes(app, {
      registry: mockRegistry as any,
      eventBus: mockEventBus as any,
      db: mockDb,
    });
    await app.ready();
    return app;
  }

  it("POST /webhooks/gitlab accepts valid webhook and returns 202", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/gitlab",
      payload: { ref: "refs/heads/main" },
      headers: { "x-gitlab-token": "my-secret" },
    });

    expect(response.statusCode).toBe(202);
    const body = JSON.parse(response.body);
    expect(body.accepted).toBe(true);
    expect(body.repo).toBe("group/repo");
    expect(body.commit).toBe("abc123");
    expect(mockEventBus.publish).toHaveBeenCalledWith(
      "sentinel.scan-triggers",
      expect.objectContaining({ orgId: "org-1", repo: "group/repo" }),
    );
    await app.close();
  });

  it("returns 404 for unregistered provider", async () => {
    mockRegistry.has.mockReturnValue(false);
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/unknown-provider",
      payload: {},
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toBe("Unknown VCS provider");
    await app.close();
  });

  it("returns 401 for failed signature verification", async () => {
    mockProvider.verifyWebhook.mockResolvedValue(false);
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/gitlab",
      payload: { ref: "refs/heads/main" },
      headers: { "x-gitlab-token": "wrong" },
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error).toBe("Invalid webhook signature");
    await app.close();
  });

  it("returns 200 ignored for irrelevant events", async () => {
    mockProvider.parseWebhook.mockResolvedValue(null);
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/gitlab",
      payload: { object_kind: "note" },
      headers: { "x-gitlab-token": "my-secret" },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).ignored).toBe(true);
    expect(mockEventBus.publish).not.toHaveBeenCalled();
    await app.close();
  });
});
