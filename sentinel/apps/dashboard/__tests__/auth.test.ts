import { describe, test, expect, afterEach } from "vitest";
import { resolveRole, getConfiguredProviders } from "../lib/auth";

describe("auth", () => {
  afterEach(() => {
    delete process.env.SENTINEL_ROLE_MAP;
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.GITLAB_CLIENT_ID;
    delete process.env.GITLAB_CLIENT_SECRET;
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
});
