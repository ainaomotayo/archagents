import { describe, it, expect } from "vitest";
import { buildSamlMetadataXml } from "../routes/saml-metadata.js";

describe("SAML SP metadata", () => {
  it("generates valid XML with entityID and ACS URL", () => {
    const xml = buildSamlMetadataXml({
      entityId: "https://sentinel.example.com",
      acsUrl: "https://sentinel.example.com/api/auth/callback/saml-jackson",
      orgName: "Sentinel",
    });
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('entityID="https://sentinel.example.com"');
    expect(xml).toContain("urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST");
    expect(xml).toContain("https://sentinel.example.com/api/auth/callback/saml-jackson");
    expect(xml).toContain("urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress");
  });

  it("includes signing certificate when provided", () => {
    const xml = buildSamlMetadataXml({
      entityId: "https://sentinel.example.com",
      acsUrl: "https://sentinel.example.com/api/auth/callback/saml-jackson",
      orgName: "Sentinel",
      signingCert: "MIIBfake...",
    });
    expect(xml).toContain("ds:X509Certificate");
    expect(xml).toContain("MIIBfake...");
  });

  it("omits KeyDescriptor when no signing cert", () => {
    const xml = buildSamlMetadataXml({
      entityId: "https://sentinel.example.com",
      acsUrl: "https://sentinel.example.com/api/auth/callback/saml-jackson",
      orgName: "Sentinel",
    });
    expect(xml).not.toContain("ds:X509Certificate");
  });

  it("includes Organization element", () => {
    const xml = buildSamlMetadataXml({
      entityId: "https://sentinel.example.com",
      acsUrl: "https://sentinel.example.com/api/auth/callback/saml-jackson",
      orgName: "Acme Corp",
    });
    expect(xml).toContain("<md:OrganizationName");
    expect(xml).toContain("Acme Corp");
  });
});
