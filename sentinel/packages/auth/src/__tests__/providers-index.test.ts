import { describe, it, expect } from "vitest";
import { createDefaultRegistry } from "../providers/index.js";

describe("createDefaultRegistry", () => {
  it("returns a registry with all 6 providers", () => {
    const registry = createDefaultRegistry();
    expect(registry.has("okta")).toBe(true);
    expect(registry.has("azure-ad")).toBe(true);
    expect(registry.has("google-workspace")).toBe(true);
    expect(registry.has("ping-federate")).toBe(true);
    expect(registry.has("generic-oidc")).toBe(true);
    expect(registry.has("generic-saml")).toBe(true);
  });

  it("each provider has the correct protocol", () => {
    const registry = createDefaultRegistry();
    expect(registry.resolve("okta")!.protocol).toBe("oidc");
    expect(registry.resolve("azure-ad")!.protocol).toBe("oidc");
    expect(registry.resolve("google-workspace")!.protocol).toBe("oidc");
    expect(registry.resolve("ping-federate")!.protocol).toBe("saml");
    expect(registry.resolve("generic-oidc")!.protocol).toBe("oidc");
    expect(registry.resolve("generic-saml")!.protocol).toBe("saml");
  });
});
