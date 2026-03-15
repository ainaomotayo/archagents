import { describe, it, expect, vi } from "vitest";
import { GoogleWorkspaceProvider } from "../providers/google-workspace.js";
import type { SsoConfigInput } from "../providers/types.js";

function validConfig(
  overrides: Partial<SsoConfigInput> = {},
): SsoConfigInput {
  return {
    provider: "google-workspace",
    clientId: "123456.apps.googleusercontent.com",
    clientSecret: "GOCSPX-secret",
    ...overrides,
  };
}

describe("GoogleWorkspaceProvider", () => {
  it("has correct id and protocol", () => {
    const p = new GoogleWorkspaceProvider();
    expect(p.id).toBe("google-workspace");
    expect(p.protocol).toBe("oidc");
    expect(p.displayName).toBe("Google Workspace");
  });

  describe("validateConfig", () => {
    it("validates valid config", () => {
      const p = new GoogleWorkspaceProvider();
      const result = p.validateConfig(validConfig());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects missing clientId", () => {
      const p = new GoogleWorkspaceProvider();
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
    it("maps Google profile with hd claim", () => {
      const p = new GoogleWorkspaceProvider();
      const claims = p.mapClaims({
        sub: "1180234567890",
        email: "alice@acme.com",
        name: "Alice Smith",
        picture: "https://lh3.googleusercontent.com/photo.jpg",
        hd: "acme.com",
      });
      expect(claims).toEqual({
        sub: "1180234567890",
        email: "alice@acme.com",
        name: "Alice Smith",
        picture: "https://lh3.googleusercontent.com/photo.jpg",
      });
    });
  });

  describe("testConnection", () => {
    it("hits Google OIDC discovery", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          issuer: "https://accounts.google.com",
          scopes_supported: ["openid", "email", "profile"],
        }),
      });
      const p = new GoogleWorkspaceProvider(mockFetch);
      const result = await p.testConnection(validConfig());

      expect(mockFetch).toHaveBeenCalledOnce();
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe(
        "https://accounts.google.com/.well-known/openid-configuration",
      );
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});
