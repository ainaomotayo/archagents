import { describe, it, expect, vi } from "vitest";
import { createAuthHook } from "./auth.js";
import { signRequest } from "@sentinel/auth";

function mockRequest(
  headers: Record<string, string>,
  body: unknown,
  options?: { method?: string; url?: string },
) {
  return {
    headers,
    body,
    method: options?.method ?? "POST",
    url: options?.url ?? "/v1/scans",
    routeOptions: { url: options?.url ?? "/v1/scans" },
  } as unknown as Parameters<ReturnType<typeof createAuthHook>>[0];
}

function mockReply() {
  const reply: Record<string, unknown> = {};
  reply.code = vi.fn().mockReturnValue(reply);
  reply.send = vi.fn().mockReturnValue(reply);
  return reply as unknown as Parameters<ReturnType<typeof createAuthHook>>[1];
}

describe("createAuthHook", () => {
  const SECRET = "test-org-secret";

  it("passes valid HMAC-signed request", async () => {
    const hook = createAuthHook({
      getOrgSecret: async () => SECRET,
    });

    const body = JSON.stringify({ projectId: "p1" });
    const signature = signRequest(body, SECRET);

    const request = mockRequest(
      { "x-sentinel-signature": signature, "x-sentinel-api-key": "key-1" },
      body,
    );
    const reply = mockReply();

    await hook(request, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it("rejects request with missing signature", async () => {
    const hook = createAuthHook({
      getOrgSecret: async () => SECRET,
    });

    const request = mockRequest({}, { data: "test" });
    const reply = mockReply();

    await hook(request, reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Missing X-Sentinel-Signature header",
    });
  });

  it("passes RBAC for trailing-slash path (viewer GET /v1/scans/)", async () => {
    const hook = createAuthHook({
      getOrgSecret: async () => SECRET,
    });

    const body = JSON.stringify({ projectId: "p1" });
    const signature = signRequest(body, SECRET);

    const request = mockRequest(
      {
        "x-sentinel-signature": signature,
        "x-sentinel-api-key": "key-1",
        "x-sentinel-role": "viewer",
      },
      body,
      { method: "GET", url: "/v1/scans/" },
    );
    const reply = mockReply();

    await hook(request, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it("reads X-Sentinel-Role header for dashboard client", async () => {
    const hook = createAuthHook({
      getOrgSecret: async () => SECRET,
    });

    const body = "";
    const signature = signRequest(body, SECRET);

    const request = mockRequest(
      {
        "x-sentinel-signature": signature,
        "x-sentinel-api-key": "dashboard",
        "x-sentinel-role": "manager",
      },
      body,
      { method: "GET", url: "/v1/policies" },
    );
    const reply = mockReply();

    await hook(request, reply);

    expect((request as any).role).toBe("manager");
    expect(reply.code).not.toHaveBeenCalledWith(403);
  });

  it("reads X-Sentinel-Org-Id header for dashboard client", async () => {
    const hook = createAuthHook({
      getOrgSecret: async () => SECRET,
    });

    const body = "";
    const signature = signRequest(body, SECRET);

    const request = mockRequest(
      {
        "x-sentinel-signature": signature,
        "x-sentinel-api-key": "dashboard",
        "x-sentinel-role": "admin",
        "x-sentinel-org-id": "org-123",
      },
      body,
      { method: "GET", url: "/v1/scans" },
    );
    const reply = mockReply();

    await hook(request, reply);

    expect((request as any).orgId).toBe("org-123");
  });

  it("rejects request with invalid API key", async () => {
    const hook = createAuthHook({
      getOrgSecret: async () => null,
    });

    const request = mockRequest(
      { "x-sentinel-signature": "t=123,sig=abc" },
      { data: "test" },
    );
    const reply = mockReply();

    await hook(request, reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: "Invalid API key" });
  });
});
