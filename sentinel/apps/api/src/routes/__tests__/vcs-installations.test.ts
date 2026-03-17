import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerVcsInstallationRoutes } from "../vcs-installations.js";

// Mock Fastify app that captures route handlers
function createMockApp() {
  const routes: Record<string, Function> = {};
  return {
    get: vi.fn((path: string, ...args: any[]) => {
      routes[`GET ${path}`] = args[args.length - 1];
    }),
    post: vi.fn((path: string, ...args: any[]) => {
      routes[`POST ${path}`] = args[args.length - 1];
    }),
    put: vi.fn((path: string, ...args: any[]) => {
      routes[`PUT ${path}`] = args[args.length - 1];
    }),
    delete: vi.fn((path: string, ...args: any[]) => {
      routes[`DELETE ${path}`] = args[args.length - 1];
    }),
    routes,
  };
}

function createMockReply() {
  const reply: any = {
    statusCode: 200,
    body: null,
    code: vi.fn(function (this: any, code: number) {
      this.statusCode = code;
      return this;
    }),
    send: vi.fn(function (this: any, body: any) {
      this.body = body;
      return this;
    }),
  };
  return reply;
}

describe("VCS Installation Routes", () => {
  let app: any;
  let db: any;

  beforeEach(() => {
    app = createMockApp();
    db = {
      vcsInstallation: {
        findMany: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };
    registerVcsInstallationRoutes(app as any, { db });
  });

  describe("GET /v1/vcs-installations", () => {
    it("returns installations for the org", async () => {
      const mockInstallations = [
        { id: "1", provider: "github", owner: "acme" },
      ];
      db.vcsInstallation.findMany.mockResolvedValue(mockInstallations);
      const reply = createMockReply();

      await app.routes["GET /v1/vcs-installations"](
        { orgId: "org-1" },
        reply,
      );

      expect(db.vcsInstallation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { orgId: "org-1" } }),
      );
      expect(reply.send).toHaveBeenCalledWith({
        installations: mockInstallations,
      });
    });

    it("returns 401 when orgId is missing", async () => {
      const reply = createMockReply();
      await app.routes["GET /v1/vcs-installations"]({}, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });
  });

  describe("POST /v1/vcs-installations", () => {
    it("creates a new installation", async () => {
      const created = {
        id: "new-1",
        provider: "azure_devops",
        owner: "acme",
      };
      db.vcsInstallation.create.mockResolvedValue(created);
      const reply = createMockReply();

      await app.routes["POST /v1/vcs-installations"](
        {
          orgId: "org-1",
          body: {
            provider: "azure_devops",
            installationId: "repo-1",
            owner: "acme",
            organizationUrl: "https://dev.azure.com/acme",
            projectName: "demo",
            pat: "token",
          },
        },
        reply,
      );

      expect(reply.code).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith(created);
    });

    it("returns 400 when required fields missing", async () => {
      const reply = createMockReply();
      await app.routes["POST /v1/vcs-installations"](
        { orgId: "org-1", body: { provider: "github" } },
        reply,
      );
      expect(reply.code).toHaveBeenCalledWith(400);
    });

    it("returns 401 when orgId is missing", async () => {
      const reply = createMockReply();
      await app.routes["POST /v1/vcs-installations"](
        { body: { provider: "github" } },
        reply,
      );
      expect(reply.code).toHaveBeenCalledWith(401);
    });
  });

  describe("PUT /v1/vcs-installations/:id", () => {
    it("updates an existing installation", async () => {
      const existing = {
        id: "1",
        active: true,
        webhookSecret: "old",
        owner: "acme",
      };
      db.vcsInstallation.findFirst.mockResolvedValue(existing);
      const updated = { ...existing, active: false };
      db.vcsInstallation.update.mockResolvedValue(updated);
      const reply = createMockReply();

      await app.routes["PUT /v1/vcs-installations/:id"](
        { orgId: "org-1", params: { id: "1" }, body: { active: false } },
        reply,
      );

      expect(db.vcsInstallation.findFirst).toHaveBeenCalledWith({
        where: { id: "1", orgId: "org-1" },
      });
      expect(reply.send).toHaveBeenCalledWith(updated);
    });

    it("returns 404 when not found", async () => {
      db.vcsInstallation.findFirst.mockResolvedValue(null);
      const reply = createMockReply();

      await app.routes["PUT /v1/vcs-installations/:id"](
        { orgId: "org-1", params: { id: "missing" }, body: {} },
        reply,
      );
      expect(reply.code).toHaveBeenCalledWith(404);
    });

    it("returns 401 when orgId is missing", async () => {
      const reply = createMockReply();
      await app.routes["PUT /v1/vcs-installations/:id"](
        { params: { id: "1" }, body: {} },
        reply,
      );
      expect(reply.code).toHaveBeenCalledWith(401);
    });
  });

  describe("DELETE /v1/vcs-installations/:id", () => {
    it("deletes an installation", async () => {
      db.vcsInstallation.findFirst.mockResolvedValue({ id: "1" });
      db.vcsInstallation.delete.mockResolvedValue({});
      const reply = createMockReply();

      await app.routes["DELETE /v1/vcs-installations/:id"](
        { orgId: "org-1", params: { id: "1" } },
        reply,
      );

      expect(db.vcsInstallation.delete).toHaveBeenCalledWith({
        where: { id: "1" },
      });
      expect(reply.code).toHaveBeenCalledWith(204);
    });

    it("returns 404 when not found", async () => {
      db.vcsInstallation.findFirst.mockResolvedValue(null);
      const reply = createMockReply();

      await app.routes["DELETE /v1/vcs-installations/:id"](
        { orgId: "org-1", params: { id: "missing" } },
        reply,
      );
      expect(reply.code).toHaveBeenCalledWith(404);
    });

    it("returns 401 when orgId is missing", async () => {
      const reply = createMockReply();
      await app.routes["DELETE /v1/vcs-installations/:id"](
        { params: { id: "1" } },
        reply,
      );
      expect(reply.code).toHaveBeenCalledWith(401);
    });
  });

  describe("POST /v1/vcs-installations/:id/test", () => {
    it("returns success for existing installation", async () => {
      db.vcsInstallation.findFirst.mockResolvedValue({
        id: "1",
        provider: "github",
        owner: "acme",
      });
      const reply = createMockReply();

      await app.routes["POST /v1/vcs-installations/:id/test"](
        { orgId: "org-1", params: { id: "1" } },
        reply,
      );

      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        provider: "github",
        owner: "acme",
      });
    });

    it("returns 404 when installation not found", async () => {
      db.vcsInstallation.findFirst.mockResolvedValue(null);
      const reply = createMockReply();

      await app.routes["POST /v1/vcs-installations/:id/test"](
        { orgId: "org-1", params: { id: "missing" } },
        reply,
      );
      expect(reply.code).toHaveBeenCalledWith(404);
    });

    it("returns 401 when orgId is missing", async () => {
      const reply = createMockReply();
      await app.routes["POST /v1/vcs-installations/:id/test"](
        { params: { id: "1" } },
        reply,
      );
      expect(reply.code).toHaveBeenCalledWith(401);
    });
  });
});
