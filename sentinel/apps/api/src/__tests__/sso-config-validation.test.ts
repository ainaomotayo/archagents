import { describe, it, expect } from "vitest";
import { createDefaultRegistry } from "@sentinel/auth";

describe("SSO config provider validation", () => {
  const registry = createDefaultRegistry();

  it("rejects Okta config without issuerUrl", () => {
    const provider = registry.resolve("okta")!;
    const result = provider.validateConfig({
      provider: "okta",
      clientId: "id",
      clientSecret: "secret",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "issuerUrl")).toBe(true);
  });

  it("rejects Azure AD config with invalid tenantId", () => {
    const provider = registry.resolve("azure-ad")!;
    const result = provider.validateConfig({
      provider: "azure-ad",
      clientId: "id",
      clientSecret: "secret",
      tenantId: "not-a-guid",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "tenantId")).toBe(true);
  });

  it("accepts valid Generic SAML config with metadata URL", () => {
    const provider = registry.resolve("generic-saml")!;
    const result = provider.validateConfig({
      provider: "generic-saml",
      clientId: "entity-1",
      clientSecret: "",
      metadataUrl: "https://idp.example.com/metadata",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects Generic OIDC config with HTTP issuer", () => {
    const provider = registry.resolve("generic-oidc")!;
    const result = provider.validateConfig({
      provider: "generic-oidc",
      clientId: "id",
      clientSecret: "secret",
      issuerUrl: "http://insecure.com",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("HTTPS"))).toBe(true);
  });
});
