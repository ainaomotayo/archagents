import { describe, it, expect, vi } from "vitest";
import { GenericOidcProvider } from "../providers/generic-oidc.js";

function makeFetch(overrides: Partial<Response> = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      issuer: "https://idp.example.com",
      scopes_supported: ["openid", "email", "profile"],
    }),
    ...overrides,
  });
}

describe("GenericOidcProvider", () => {
  const provider = new GenericOidcProvider();

  describe("validateConfig", () => {
    it("requires clientId, clientSecret, and issuerUrl", () => {
      const result = provider.validateConfig({
        provider: "generic-oidc",
        clientId: "",
        clientSecret: "",
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors.map((e) => e.field)).toEqual(
        expect.arrayContaining(["clientId", "clientSecret", "issuerUrl"]),
      );
    });

    it("rejects non-HTTPS issuerUrl", () => {
      const result = provider.validateConfig({
        provider: "generic-oidc",
        clientId: "id",
        clientSecret: "secret",
        issuerUrl: "http://not-secure.com",
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("HTTPS");
    });

    it("passes with valid config", () => {
      const result = provider.validateConfig({
        provider: "generic-oidc",
        clientId: "id",
        clientSecret: "secret",
        issuerUrl: "https://idp.example.com",
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("testConnection", () => {
    it("returns success with metadata on 200", async () => {
      const fetchFn = makeFetch();
      const p = new GenericOidcProvider(fetchFn);
      const result = await p.testConnection({
        provider: "generic-oidc",
        clientId: "id",
        clientSecret: "secret",
        issuerUrl: "https://idp.example.com",
      });
      expect(result.success).toBe(true);
      expect(result.metadata?.issuer).toBe("https://idp.example.com");
      expect(fetchFn).toHaveBeenCalledWith(
        "https://idp.example.com/.well-known/openid-configuration",
        expect.any(Object),
      );
    });

    it("returns failure on HTTP error", async () => {
      const fetchFn = makeFetch({ ok: false, status: 404 } as any);
      const p = new GenericOidcProvider(fetchFn);
      const result = await p.testConnection({
        provider: "generic-oidc",
        clientId: "id",
        clientSecret: "secret",
        issuerUrl: "https://idp.example.com",
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe("HTTP 404");
    });

    it("returns failure on network error", async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error("timeout"));
      const p = new GenericOidcProvider(fetchFn);
      const result = await p.testConnection({
        provider: "generic-oidc",
        clientId: "id",
        clientSecret: "secret",
        issuerUrl: "https://idp.example.com",
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe("timeout");
    });
  });

  describe("mapClaims", () => {
    it("maps standard OIDC claims with groups", () => {
      const claims = provider.mapClaims({
        sub: "user-123",
        email: "user@example.com",
        name: "Test User",
        groups: ["admins", "devs"],
        picture: "https://example.com/avatar.jpg",
      });
      expect(claims).toEqual({
        sub: "user-123",
        email: "user@example.com",
        name: "Test User",
        groups: ["admins", "devs"],
        picture: "https://example.com/avatar.jpg",
      });
    });

    it("falls back to preferred_username for name", () => {
      const claims = provider.mapClaims({
        sub: "u1",
        email: "a@b.com",
        preferred_username: "alice",
      });
      expect(claims.name).toBe("alice");
    });
  });
});
