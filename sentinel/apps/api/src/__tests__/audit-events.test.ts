import { describe, it, expect, vi } from "vitest";
import { buildSsoAuditEvent, emitSsoAuditEvent } from "../../../../apps/dashboard/lib/auth-audit";

describe("audit event structure", () => {
  it("builds a complete audit event from params", () => {
    const event = buildSsoAuditEvent("sso.login.success", {
      provider: "okta",
      email: "user@acme.com",
      ip: "1.2.3.4",
      orgId: "org-1",
    });
    expect(event.action).toBe("sso.login.success");
    expect(event.actorType).toBe("user");
    expect(event.actorId).toBe("user@acme.com");
    expect(event.actorIp).toBe("1.2.3.4");
    expect(event.resourceType).toBe("sso_session");
    expect(event.resourceId).toBe("org-1");
    expect(event.detail).toEqual({ provider: "okta", email: "user@acme.com" });
  });

  it("includes reason and role in detail when provided", () => {
    const event = buildSsoAuditEvent("sso.login.blocked", {
      provider: "github",
      email: "bad@acme.com",
      orgId: "org-1",
      reason: "sso_enforcement",
      role: "viewer",
    });
    expect(event.detail.reason).toBe("sso_enforcement");
    expect(event.detail.role).toBe("viewer");
  });

  it("emitSsoAuditEvent fails silently on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    // Should not throw
    await emitSsoAuditEvent("sso.login.success", {
      provider: "okta",
      email: "user@acme.com",
      orgId: "org-1",
    });
    vi.unstubAllGlobals();
  });
});
