import { describe, it, expect } from "vitest";
import { resolveProviders } from "../routes/auth-discovery.js";

describe("SSO Discovery", () => {
  it("returns org providers for known domain", async () => {
    const lookup = async (domain: string) => domain === "acme.com"
      ? { orgId: "org-1", orgName: "Acme", providers: [{ id: "oidc", name: "Acme SSO", enforced: false }] }
      : null;
    const result = await resolveProviders("alice@acme.com", lookup);
    expect(result.providers).toHaveLength(2);
    expect(result.providers[0].id).toBe("oidc");
    expect(result.orgId).toBe("org-1");
  });

  it("returns default providers for unknown domain", async () => {
    const lookup = async () => null;
    const result = await resolveProviders("user@random.com", lookup);
    expect(result.providers.length).toBeGreaterThan(0);
    expect(result.orgId).toBeUndefined();
  });

  it("does not leak secrets", async () => {
    const lookup = async (domain: string) => domain === "acme.com"
      ? { orgId: "org-1", orgName: "Acme", providers: [{ id: "oidc", name: "Acme SSO", enforced: true }] }
      : null;
    const result = await resolveProviders("alice@acme.com", lookup);
    const provider = result.providers[0];
    expect(provider).not.toHaveProperty("clientId");
    expect(provider).not.toHaveProperty("clientSecret");
  });
});
