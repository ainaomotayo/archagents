import { describe, test, expect, afterEach } from "vitest";
import { resolveRole, getConfiguredProviders, authOptions, rateLimiter, providerHealth } from "../lib/auth";
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
