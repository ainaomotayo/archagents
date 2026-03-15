import { describe, it, expect, vi } from "vitest";
import { AzureAdProvider } from "../providers/azure-ad.js";
import type { SsoConfigInput } from "../providers/types.js";

function validConfig(overrides: Partial<SsoConfigInput> = {}): SsoConfigInput {
  return {
    provider: "azure-ad",
    clientId: "app-client-id",
    clientSecret: "secret-value",
    tenantId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    ...overrides,
  };
}

describe("AzureAdProvider", () => {
  it("has correct id, protocol, and displayName", () => {
    const p = new AzureAdProvider();
    expect(p.id).toBe("azure-ad");
    expect(p.protocol).toBe("oidc");
    expect(p.displayName).toBe("Microsoft Entra ID");
  });

  describe("validateConfig", () => {
    it("validates valid config with GUID tenantId", () => {
      const p = new AzureAdProvider();
      const result = p.validateConfig(validConfig());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects missing tenantId", () => {
      const p = new AzureAdProvider();
      const result = p.validateConfig(validConfig({ tenantId: undefined }));
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "tenantId" }),
        ]),
      );
    });

    it("rejects invalid GUID format", () => {
      const p = new AzureAdProvider();
      const result = p.validateConfig(validConfig({ tenantId: "not-a-guid" }));
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "tenantId" }),
        ]),
      );
    });

    it('accepts "common", "organizations", "consumers" as tenantId', () => {
      const p = new AzureAdProvider();
      for (const tenantId of ["common", "organizations", "consumers"]) {
        const result = p.validateConfig(validConfig({ tenantId }));
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });
  });

  describe("mapClaims", () => {
    it("maps Azure AD profile to standard claims", () => {
      const p = new AzureAdProvider();
      const claims = p.mapClaims({
        sub: "oid-123",
        email: "alice@contoso.com",
        name: "Alice Smith",
        picture: "https://graph.microsoft.com/photo.jpg",
        groups: ["admins", "developers"],
      });
      expect(claims).toEqual({
        sub: "oid-123",
        email: "alice@contoso.com",
        name: "Alice Smith",
        picture: "https://graph.microsoft.com/photo.jpg",
        groups: ["admins", "developers"],
      });
    });

    it("maps profile using preferred_username when email missing", () => {
      const p = new AzureAdProvider();
      const claims = p.mapClaims({
        sub: "oid-456",
        name: "Bob Jones",
        preferred_username: "bob@contoso.com",
      });
      expect(claims.email).toBe("bob@contoso.com");
    });
  });

  describe("getIssuerUrl", () => {
    it("constructs correct issuer URL from tenant ID", () => {
      const p = new AzureAdProvider();
      expect(p.getIssuerUrl("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(
        "https://login.microsoftonline.com/a1b2c3d4-e5f6-7890-abcd-ef1234567890/v2.0",
      );
      expect(p.getIssuerUrl("common")).toBe(
        "https://login.microsoftonline.com/common/v2.0",
      );
    });
  });

  describe("testConnection", () => {
    it("hits Azure OIDC discovery with mock fetch", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          issuer:
            "https://login.microsoftonline.com/a1b2c3d4-e5f6-7890-abcd-ef1234567890/v2.0",
          scopes_supported: ["openid", "email", "profile"],
        }),
      });
      const p = new AzureAdProvider(mockFetch);
      const result = await p.testConnection(validConfig());

      expect(mockFetch).toHaveBeenCalledOnce();
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe(
        "https://login.microsoftonline.com/a1b2c3d4-e5f6-7890-abcd-ef1234567890/v2.0/.well-known/openid-configuration",
      );
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata).toEqual({
        issuer:
          "https://login.microsoftonline.com/a1b2c3d4-e5f6-7890-abcd-ef1234567890/v2.0",
        supportedScopes: ["openid", "email", "profile"],
      });
    });
  });
});
