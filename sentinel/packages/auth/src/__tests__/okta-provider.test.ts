import { describe, it, expect, vi } from "vitest";
import { OktaProvider } from "../providers/okta.js";
import type { SsoConfigInput } from "../providers/types.js";

function validConfig(overrides: Partial<SsoConfigInput> = {}): SsoConfigInput {
  return {
    provider: "okta",
    clientId: "0oabc123",
    clientSecret: "secret-value",
    issuerUrl: "https://acme.okta.com",
    ...overrides,
  };
}

describe("OktaProvider", () => {
  it("has correct id, protocol, and displayName", () => {
    const p = new OktaProvider();
    expect(p.id).toBe("okta");
    expect(p.protocol).toBe("oidc");
    expect(p.displayName).toBe("Okta");
  });

  describe("validateConfig", () => {
    it("validates a valid config", () => {
      const p = new OktaProvider();
      const result = p.validateConfig(validConfig());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("validates custom Okta domain", () => {
      const p = new OktaProvider();
      const result = p.validateConfig(
        validConfig({ issuerUrl: "https://sso.acme.com/oauth2/default" }),
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects missing issuerUrl", () => {
      const p = new OktaProvider();
      const result = p.validateConfig(validConfig({ issuerUrl: undefined }));
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "issuerUrl" }),
        ]),
      );
    });

    it("rejects http:// issuerUrl", () => {
      const p = new OktaProvider();
      const result = p.validateConfig(
        validConfig({ issuerUrl: "http://acme.okta.com" }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "issuerUrl", message: expect.stringContaining("HTTPS") }),
        ]),
      );
    });

    it("rejects empty clientId", () => {
      const p = new OktaProvider();
      const result = p.validateConfig(validConfig({ clientId: "" }));
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "clientId" }),
        ]),
      );
    });
  });

  describe("mapClaims", () => {
    it("maps Okta profile with all fields", () => {
      const p = new OktaProvider();
      const claims = p.mapClaims({
        sub: "00u123",
        email: "alice@acme.com",
        name: "Alice Smith",
        picture: "https://example.com/avatar.png",
        groups: ["admins", "developers"],
      });
      expect(claims).toEqual({
        sub: "00u123",
        email: "alice@acme.com",
        name: "Alice Smith",
        picture: "https://example.com/avatar.png",
        groups: ["admins", "developers"],
      });
    });

    it("falls back to preferred_username when name is missing", () => {
      const p = new OktaProvider();
      const claims = p.mapClaims({
        sub: "00u456",
        email: "bob@acme.com",
        preferred_username: "bob.jones",
      });
      expect(claims.name).toBe("bob.jones");
    });

    it("maps profile with missing optional fields", () => {
      const p = new OktaProvider();
      const claims = p.mapClaims({
        sub: "00u789",
        email: "carol@acme.com",
        name: "Carol",
      });
      expect(claims.groups).toBeUndefined();
      expect(claims.picture).toBeUndefined();
    });
  });

  describe("testConnection", () => {
    it("calls OIDC discovery and returns success", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          issuer: "https://acme.okta.com",
          scopes_supported: ["openid", "email"],
        }),
      });
      const p = new OktaProvider(mockFetch);
      const result = await p.testConnection(validConfig());

      expect(mockFetch).toHaveBeenCalledOnce();
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe(
        "https://acme.okta.com/.well-known/openid-configuration",
      );
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata).toEqual({
        issuer: "https://acme.okta.com",
        supportedScopes: ["openid", "email"],
      });
    });

    it("returns failure on network error", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network timeout"));
      const p = new OktaProvider(mockFetch);
      const result = await p.testConnection(validConfig());

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network timeout");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});
