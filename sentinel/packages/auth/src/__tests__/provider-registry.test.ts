import { describe, it, expect, vi } from "vitest";
import type { SsoProvider } from "../providers/types.js";
import { ProviderRegistry } from "../providers/registry.js";

function makeMockProvider(id: string, protocol: "oidc" | "saml" = "oidc"): SsoProvider {
  return {
    id: id as any,
    protocol,
    displayName: `Mock ${id}`,
    validateConfig: vi.fn(() => ({ valid: true, errors: [] })),
    testConnection: vi.fn(async () => ({ success: true, latencyMs: 10 })),
    mapClaims: vi.fn((profile) => ({
      sub: (profile.sub as string) ?? "unknown",
      email: (profile.email as string) ?? "",
      name: (profile.name as string) ?? "",
    })),
  };
}

describe("ProviderRegistry", () => {
  it("register and resolve a provider", () => {
    const registry = new ProviderRegistry();
    const provider = makeMockProvider("okta");
    registry.register(provider);
    expect(registry.resolve("okta")).toBe(provider);
  });

  it("resolve returns undefined for unregistered provider", () => {
    const registry = new ProviderRegistry();
    expect(registry.resolve("okta")).toBeUndefined();
  });

  it("listAll returns all registered providers", () => {
    const registry = new ProviderRegistry();
    const okta = makeMockProvider("okta");
    const azure = makeMockProvider("azure-ad");
    registry.register(okta);
    registry.register(azure);
    expect(registry.listAll()).toEqual([okta, azure]);
  });

  it("register overwrites existing provider of same id", () => {
    const registry = new ProviderRegistry();
    const first = makeMockProvider("okta");
    const second = makeMockProvider("okta");
    registry.register(first);
    registry.register(second);
    expect(registry.resolve("okta")).toBe(second);
    expect(registry.listAll()).toHaveLength(1);
  });

  it("has returns true for registered and false for unregistered", () => {
    const registry = new ProviderRegistry();
    const provider = makeMockProvider("okta");
    expect(registry.has("okta")).toBe(false);
    registry.register(provider);
    expect(registry.has("okta")).toBe(true);
  });
});
