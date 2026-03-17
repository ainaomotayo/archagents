import { describe, test, expect } from "vitest";
import { buildSsoAuditEvent } from "../lib/auth-audit.js";

describe("SSO audit events", () => {
  test("builds login success event", () => {
    const event = buildSsoAuditEvent("sso.login.success", {
      provider: "okta", email: "alice@acme.com", ip: "1.2.3.4", orgId: "org-1",
    });
    expect(event.action).toBe("sso.login.success");
    expect(event.actorType).toBe("user");
    expect(event.detail.provider).toBe("okta");
    expect(event.actorIp).toBe("1.2.3.4");
  });

  test("builds login blocked event", () => {
    const event = buildSsoAuditEvent("sso.login.blocked", {
      provider: "github", email: "alice@acme.com", ip: "1.2.3.4", orgId: "org-1", reason: "sso_enforcement",
    });
    expect(event.action).toBe("sso.login.blocked");
    expect(event.detail.reason).toBe("sso_enforcement");
  });

  test("builds JIT provision event", () => {
    const event = buildSsoAuditEvent("sso.jit.provisioned", {
      provider: "okta", email: "alice@acme.com", orgId: "org-1", role: "viewer",
    });
    expect(event.action).toBe("sso.jit.provisioned");
    expect(event.detail.role).toBe("viewer");
  });
});
