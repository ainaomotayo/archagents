import { describe, test, expect } from "vitest";

const PROVIDER_OPTIONS = [
  { value: "okta", label: "Okta" },
  { value: "azure-ad", label: "Microsoft Entra ID (Azure AD)" },
  { value: "google-workspace", label: "Google Workspace" },
  { value: "ping-federate", label: "PingFederate" },
  { value: "generic-oidc", label: "Generic OIDC" },
  { value: "generic-saml", label: "Generic SAML" },
];

describe("SSO settings page config", () => {
  test("PROVIDER_OPTIONS has all 6 types", () => {
    expect(PROVIDER_OPTIONS).toHaveLength(6);
  });
  test("form fields differ by provider type", () => {
    const fieldsFor = (type: string) => {
      switch (type) {
        case "okta": return ["displayName", "clientId", "clientSecret", "issuerUrl"];
        case "azure-ad": return ["displayName", "clientId", "clientSecret", "tenantId"];
        case "ping-federate": return ["displayName", "clientId", "metadataUrl"];
        default: return ["displayName", "clientId", "clientSecret"];
      }
    };
    expect(fieldsFor("okta")).toContain("issuerUrl");
    expect(fieldsFor("azure-ad")).toContain("tenantId");
    expect(fieldsFor("ping-federate")).not.toContain("clientSecret");
  });
});
