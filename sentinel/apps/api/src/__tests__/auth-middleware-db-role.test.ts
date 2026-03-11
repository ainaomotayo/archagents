import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentinel/db", () => ({
  getDb: vi.fn(),
  disconnectDb: vi.fn(),
  setCurrentOrgId: vi.fn(),
  PrismaClient: vi.fn(),
  initEncryption: vi.fn(),
}));

vi.mock("@sentinel/auth", () => ({
  verifyRequest: vi.fn(() => ({ valid: true })),
  verifyApiKey: vi.fn(async () => false),
  extractPrefix: vi.fn((k: string) => k.slice(0, 8)),
  signRequest: vi.fn(),
}));

vi.mock("@sentinel/security", () => ({
  isAuthorized: vi.fn(() => true),
}));

import { createAuthHook } from "../middleware/auth.js";
import { setCurrentOrgId } from "@sentinel/db";

function makeFakeRequest(headers: Record<string, string> = {}, url = "/api/v1/scans") {
  return {
    headers,
    url,
    method: "GET",
    body: "",
    routeOptions: { url },
  } as any;
}

function makeFakeReply() {
  const reply: any = {
    statusCode: 200,
    body: null,
    code(status: number) {
      reply.statusCode = status;
      return reply;
    },
    send(payload: any) {
      reply.body = payload;
      return reply;
    },
  };
  return reply;
}

describe("auth middleware DB role resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createAuthHook accepts resolveDbRole option", () => {
    const hook = createAuthHook({
      getOrgSecret: async () => "secret",
      resolveDbRole: async (_userId: string, _orgId: string) => "admin",
    });
    expect(typeof hook).toBe("function");
  });

  it("returned hook is callable", async () => {
    const hook = createAuthHook({
      getOrgSecret: async () => "secret",
      resolveDbRole: async () => "admin",
    });
    const request = makeFakeRequest({
      "x-sentinel-signature": "t=9999999999,sig=abc",
      "x-sentinel-org-id": "org-123",
      "x-sentinel-user-id": "user-456",
    });
    const reply = makeFakeReply();
    await hook(request, reply);
    // Should have set role from DB lookup
    expect(request.role).toBe("admin");
    expect(request.orgId).toBe("org-123");
  });

  it("calls setCurrentOrgId with the resolved orgId", async () => {
    const hook = createAuthHook({
      getOrgSecret: async () => "secret",
    });
    const request = makeFakeRequest({
      "x-sentinel-signature": "t=9999999999,sig=abc",
      "x-sentinel-org-id": "org-789",
    });
    const reply = makeFakeReply();
    await hook(request, reply);
    expect(setCurrentOrgId).toHaveBeenCalledWith("org-789");
  });

  it("falls back to header role when resolveDbRole returns null", async () => {
    const hook = createAuthHook({
      getOrgSecret: async () => "secret",
      resolveDbRole: async () => null,
    });
    const request = makeFakeRequest({
      "x-sentinel-signature": "t=9999999999,sig=abc",
      "x-sentinel-org-id": "org-123",
      "x-sentinel-user-id": "user-456",
      "x-sentinel-role": "developer",
    });
    const reply = makeFakeReply();
    await hook(request, reply);
    expect(request.role).toBe("developer");
  });

  it("falls back to header role when no userId header is present", async () => {
    const resolveDbRole = vi.fn(async () => "admin");
    const hook = createAuthHook({
      getOrgSecret: async () => "secret",
      resolveDbRole,
    });
    const request = makeFakeRequest({
      "x-sentinel-signature": "t=9999999999,sig=abc",
      "x-sentinel-role": "viewer",
    });
    const reply = makeFakeReply();
    await hook(request, reply);
    // resolveDbRole should NOT have been called since no userId
    expect(resolveDbRole).not.toHaveBeenCalled();
    expect(request.role).toBe("viewer");
  });

  it("defaults orgId to 'default' when no org header is set", async () => {
    const hook = createAuthHook({
      getOrgSecret: async () => "secret",
    });
    const request = makeFakeRequest({
      "x-sentinel-signature": "t=9999999999,sig=abc",
    });
    const reply = makeFakeReply();
    await hook(request, reply);
    expect(request.orgId).toBe("default");
    expect(setCurrentOrgId).toHaveBeenCalledWith("default");
  });
});
