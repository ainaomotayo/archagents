import { describe, test, expect, afterEach, vi } from "vitest";
import {
  resolveRole,
  getConfiguredProviders,
  authOptions,
  rateLimiter,
  providerHealth,
  extractClientIp,
  extractProvider,
  setCurrentRequestIp,
  getCurrentRequestIp,
  logAuthEvent,
} from "../lib/auth";
import { AuthRateLimiter, ProviderHealthMonitor } from "@sentinel/security";

describe("auth", () => {
  afterEach(() => {
    delete process.env.SENTINEL_ROLE_MAP;
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.GITLAB_CLIENT_ID;
    delete process.env.GITLAB_CLIENT_SECRET;
    delete process.env.OIDC_CLIENT_ID;
    delete process.env.OIDC_CLIENT_SECRET;
    delete process.env.OIDC_ISSUER;
    delete process.env.OIDC_PROVIDER_NAME;
    delete process.env.SAML_JACKSON_URL;
    delete process.env.SAML_JACKSON_PRODUCT;
    delete process.env.SAML_CLIENT_ID;
    delete process.env.SAML_CLIENT_SECRET;
  });

  test("resolveRole returns viewer for unknown user", () => {
    expect(resolveRole(undefined)).toBe("viewer");
    expect(resolveRole(null)).toBe("viewer");
    expect(resolveRole("unknown-user")).toBe("viewer");
  });

  test("resolveRole maps by username from SENTINEL_ROLE_MAP", () => {
    process.env.SENTINEL_ROLE_MAP = "admin:alice;manager:bob";
    expect(resolveRole("alice")).toBe("admin");
    expect(resolveRole("bob")).toBe("manager");
    expect(resolveRole("charlie")).toBe("viewer");
  });

  test("resolveRole is case-insensitive", () => {
    process.env.SENTINEL_ROLE_MAP = "admin:Alice";
    expect(resolveRole("alice")).toBe("admin");
    expect(resolveRole("ALICE")).toBe("admin");
  });

  test("resolveRole maps by email for SAML/OIDC users", () => {
    process.env.SENTINEL_ROLE_MAP =
      "admin:alice@example.com;manager:bob@corp.com";
    expect(resolveRole("alice@example.com")).toBe("admin");
    expect(resolveRole("bob@corp.com")).toBe("manager");
  });

  test("getConfiguredProviders returns empty when no providers configured", () => {
    const providers = getConfiguredProviders();
    expect(providers).toEqual([]);
  });

  test("getConfiguredProviders includes GitHub when configured", () => {
    process.env.GITHUB_CLIENT_ID = "test-id";
    process.env.GITHUB_CLIENT_SECRET = "test-secret";
    const providers = getConfiguredProviders();
    expect(providers.length).toBe(1);
    expect(providers[0].id).toBe("github");
  });

  test("getConfiguredProviders includes GitLab when configured", () => {
    process.env.GITLAB_CLIENT_ID = "test-id";
    process.env.GITLAB_CLIENT_SECRET = "test-secret";
    const providers = getConfiguredProviders();
    expect(providers.length).toBe(1);
    expect(providers[0].id).toBe("gitlab");
  });

  test("getConfiguredProviders includes both when both configured", () => {
    process.env.GITHUB_CLIENT_ID = "gh-id";
    process.env.GITHUB_CLIENT_SECRET = "gh-secret";
    process.env.GITLAB_CLIENT_ID = "gl-id";
    process.env.GITLAB_CLIENT_SECRET = "gl-secret";
    const providers = getConfiguredProviders();
    expect(providers.length).toBe(2);
    const ids = providers.map((p: any) => p.id);
    expect(ids).toContain("github");
    expect(ids).toContain("gitlab");
  });

  test("getConfiguredProviders includes OIDC when configured", () => {
    process.env.OIDC_CLIENT_ID = "test-id";
    process.env.OIDC_CLIENT_SECRET = "test-secret";
    process.env.OIDC_ISSUER = "https://idp.example.com";
    const providers = getConfiguredProviders();
    expect(providers.length).toBe(1);
    expect(providers[0].id).toBe("oidc");
  });

  test("OIDC uses custom provider name from env", () => {
    process.env.OIDC_CLIENT_ID = "test-id";
    process.env.OIDC_CLIENT_SECRET = "test-secret";
    process.env.OIDC_ISSUER = "https://idp.example.com";
    process.env.OIDC_PROVIDER_NAME = "Okta";
    const providers = getConfiguredProviders();
    expect(providers[0].name).toBe("Okta");
  });

  test("getConfiguredProviders includes SAML when Jackson URL configured", () => {
    process.env.SAML_JACKSON_URL = "https://jackson.example.com";
    const providers = getConfiguredProviders();
    expect(providers.length).toBe(1);
    expect(providers[0].id).toBe("saml-jackson");
  });

  test("getConfiguredProviders returns all four when all configured", () => {
    process.env.GITHUB_CLIENT_ID = "gh-id";
    process.env.GITHUB_CLIENT_SECRET = "gh-secret";
    process.env.GITLAB_CLIENT_ID = "gl-id";
    process.env.GITLAB_CLIENT_SECRET = "gl-secret";
    process.env.OIDC_CLIENT_ID = "oidc-id";
    process.env.OIDC_CLIENT_SECRET = "oidc-secret";
    process.env.OIDC_ISSUER = "https://idp.example.com";
    process.env.SAML_JACKSON_URL = "https://jackson.example.com";
    const providers = getConfiguredProviders();
    expect(providers.length).toBe(4);
    const ids = providers.map((p: any) => p.id);
    expect(ids).toContain("github");
    expect(ids).toContain("gitlab");
    expect(ids).toContain("oidc");
    expect(ids).toContain("saml-jackson");
  });
});

describe("session security", () => {
  test("session maxAge is 8 hours", () => {
    expect(authOptions.session?.maxAge).toBe(8 * 60 * 60);
  });

  test("session updateAge is 1 hour for JWT rotation", () => {
    expect((authOptions.session as any)?.updateAge).toBe(60 * 60);
  });

  test("session strategy is jwt", () => {
    expect(authOptions.session?.strategy).toBe("jwt");
  });

  test("session cookie is httpOnly and sameSite lax", () => {
    const cookieOpts = (authOptions.cookies as any)?.sessionToken?.options;
    expect(cookieOpts?.httpOnly).toBe(true);
    expect(cookieOpts?.sameSite).toBe("lax");
  });
});

describe("auth rate limiter integration", () => {
  test("rateLimiter is an AuthRateLimiter instance", () => {
    expect(rateLimiter).toBeInstanceOf(AuthRateLimiter);
  });

  test("providerHealth is a ProviderHealthMonitor instance", () => {
    expect(providerHealth).toBeInstanceOf(ProviderHealthMonitor);
  });
});

describe("extractClientIp", () => {
  test("extracts first IP from x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" });
    expect(extractClientIp(headers)).toBe("1.2.3.4");
  });

  test("returns unknown when header is missing", () => {
    const headers = new Headers();
    expect(extractClientIp(headers)).toBe("unknown");
  });
});

describe("extractProvider", () => {
  test("extracts provider from callback URL", () => {
    expect(extractProvider("http://localhost:3000/api/auth/callback/github")).toBe("github");
  });

  test("extracts provider from signin URL", () => {
    expect(extractProvider("http://localhost:3000/api/auth/signin/gitlab")).toBe("gitlab");
  });

  test("returns undefined for non-auth URLs", () => {
    expect(extractProvider("http://localhost:3000/api/auth/session")).toBeUndefined();
  });

  test("returns undefined for malformed URLs", () => {
    expect(extractProvider("not-a-url")).toBeUndefined();
  });
});

describe("request-scoped IP helpers", () => {
  test("setCurrentRequestIp / getCurrentRequestIp round-trip", () => {
    setCurrentRequestIp("10.0.0.5");
    expect(getCurrentRequestIp()).toBe("10.0.0.5");
  });
});

describe("auth event logging", () => {
  test("logAuthEvent writes structured JSON to stdout", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logAuthEvent("auth.login.success", { ip: "1.2.3.4", provider: "github" });
    expect(spy).toHaveBeenCalledOnce();
    const logged = JSON.parse(spy.mock.calls[0][0]);
    expect(logged.event).toBe("auth.login.success");
    expect(logged.ip).toBe("1.2.3.4");
    expect(logged.provider).toBe("github");
    expect(logged.timestamp).toBeDefined();
    spy.mockRestore();
  });
});

describe("events.signIn wiring", () => {
  test("events.signIn calls rateLimiter.reset and providerHealth.recordSuccess", async () => {
    const resetSpy = vi.spyOn(rateLimiter, "reset");
    const successSpy = vi.spyOn(providerHealth, "recordSuccess");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    setCurrentRequestIp("10.0.0.1");

    await authOptions.events!.signIn!({
      user: { id: "u1" } as any,
      account: { provider: "github" } as any,
      profile: undefined as any,
      isNewUser: false,
    });

    expect(resetSpy).toHaveBeenCalledWith("10.0.0.1");
    expect(successSpy).toHaveBeenCalledWith("github");
    expect(logSpy).toHaveBeenCalled();
    const logged = JSON.parse(logSpy.mock.calls[0][0]);
    expect(logged.event).toBe("auth.login.success");

    resetSpy.mockRestore();
    successSpy.mockRestore();
    logSpy.mockRestore();
  });
});
