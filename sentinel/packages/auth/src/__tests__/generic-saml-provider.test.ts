import { describe, it, expect, vi } from "vitest";
import { GenericSamlProvider } from "../providers/generic-saml.js";

const SAMPLE_XML = `<EntityDescriptor entityID="https://idp.example.com/saml/metadata">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"/>
</EntityDescriptor>`;

function makeFetch(body: string, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    text: async () => body,
  });
}

describe("GenericSamlProvider", () => {
  const provider = new GenericSamlProvider();

  describe("validateConfig", () => {
    it("requires entityId (clientId) and metadata source", () => {
      const result = provider.validateConfig({
        provider: "generic-saml",
        clientId: "",
        clientSecret: "",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.map((e) => e.field)).toContain("clientId");
      expect(result.errors.map((e) => e.field)).toContain("metadataUrl");
    });

    it("rejects non-HTTPS metadataUrl", () => {
      const result = provider.validateConfig({
        provider: "generic-saml",
        clientId: "entity-1",
        clientSecret: "",
        metadataUrl: "http://not-secure.com/metadata",
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("HTTPS");
    });

    it("passes with metadataUrl", () => {
      const result = provider.validateConfig({
        provider: "generic-saml",
        clientId: "entity-1",
        clientSecret: "",
        metadataUrl: "https://idp.example.com/metadata",
      });
      expect(result.valid).toBe(true);
    });

    it("passes with inline samlMetadata", () => {
      const result = provider.validateConfig({
        provider: "generic-saml",
        clientId: "entity-1",
        clientSecret: "",
        samlMetadata: SAMPLE_XML,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("testConnection", () => {
    it("fetches metadata URL and extracts entityID", async () => {
      const fetchFn = makeFetch(SAMPLE_XML);
      const p = new GenericSamlProvider(fetchFn);
      const result = await p.testConnection({
        provider: "generic-saml",
        clientId: "entity-1",
        clientSecret: "",
        metadataUrl: "https://idp.example.com/metadata",
      });
      expect(result.success).toBe(true);
      expect(result.metadata?.issuer).toBe(
        "https://idp.example.com/saml/metadata",
      );
    });

    it("uses inline samlMetadata when no URL", async () => {
      const fetchFn = vi.fn();
      const p = new GenericSamlProvider(fetchFn);
      const result = await p.testConnection({
        provider: "generic-saml",
        clientId: "entity-1",
        clientSecret: "",
        samlMetadata: SAMPLE_XML,
      });
      expect(result.success).toBe(true);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("returns failure when no metadata source", async () => {
      const fetchFn = vi.fn();
      const p = new GenericSamlProvider(fetchFn);
      const result = await p.testConnection({
        provider: "generic-saml",
        clientId: "entity-1",
        clientSecret: "",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("No metadata source");
    });
  });

  describe("mapClaims", () => {
    it("maps SAML claims with memberOf groups", () => {
      const claims = provider.mapClaims({
        nameID: "user@idp.com",
        email: "user@example.com",
        name: "SAML User",
        memberOf: ["group-a", "group-b"],
      });
      expect(claims).toEqual({
        sub: "user@idp.com",
        email: "user@example.com",
        name: "SAML User",
        groups: ["group-a", "group-b"],
      });
    });

    it("maps standard groups array as fallback", () => {
      const claims = provider.mapClaims({
        sub: "u1",
        email: "a@b.com",
        groups: ["admins"],
      });
      expect(claims.groups).toEqual(["admins"]);
    });

    it("uses SAML email claim URI as fallback", () => {
      const claims = provider.mapClaims({
        nameID: "u1",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress":
          "saml@example.com",
      });
      expect(claims.email).toBe("saml@example.com");
    });
  });
});
