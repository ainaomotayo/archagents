import { describe, it, expect, vi } from "vitest";
import { PingFederateProvider } from "../providers/ping-federate.js";
import type { SsoConfigInput } from "../providers/types.js";

const SAMPLE_SAML_METADATA = `<EntityDescriptor entityID="https://ping.acme.com" xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://ping.acme.com/sso"/>
  </IDPSSODescriptor>
</EntityDescriptor>`;

function validConfig(
  overrides: Partial<SsoConfigInput> = {},
): SsoConfigInput {
  return {
    provider: "ping-federate",
    clientId: "sentinel-sp",
    clientSecret: "",
    metadataUrl: "https://ping.acme.com/pf/federation_metadata.ping",
    ...overrides,
  };
}

describe("PingFederateProvider", () => {
  it("has correct id and protocol", () => {
    const p = new PingFederateProvider();
    expect(p.id).toBe("ping-federate");
    expect(p.protocol).toBe("saml");
    expect(p.displayName).toBe("PingFederate");
  });

  describe("validateConfig", () => {
    it("validates config with metadataUrl", () => {
      const p = new PingFederateProvider();
      const result = p.validateConfig(validConfig());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("validates config with samlMetadata XML", () => {
      const p = new PingFederateProvider();
      const result = p.validateConfig(
        validConfig({
          metadataUrl: undefined,
          samlMetadata: SAMPLE_SAML_METADATA,
        }),
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects missing both metadataUrl and samlMetadata", () => {
      const p = new PingFederateProvider();
      const result = p.validateConfig(
        validConfig({ metadataUrl: undefined, samlMetadata: undefined }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "metadataUrl",
          }),
        ]),
      );
    });
  });

  describe("mapClaims", () => {
    it("maps SAML assertion attributes to standard claims with memberOf groups", () => {
      const p = new PingFederateProvider();
      const claims = p.mapClaims({
        sub: "uid-12345",
        email: "bob@acme.com",
        name: "Bob Jones",
        memberOf: ["Engineering", "DevOps"],
      });
      expect(claims).toEqual({
        sub: "uid-12345",
        email: "bob@acme.com",
        name: "Bob Jones",
        groups: ["Engineering", "DevOps"],
      });
    });
  });

  describe("testConnection", () => {
    it("fetches SAML metadata and extracts entityID", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => SAMPLE_SAML_METADATA,
      });
      const p = new PingFederateProvider(mockFetch);
      const result = await p.testConnection(validConfig());

      expect(mockFetch).toHaveBeenCalledOnce();
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe(
        "https://ping.acme.com/pf/federation_metadata.ping",
      );
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata?.issuer).toBe("https://ping.acme.com");
    });
  });
});
