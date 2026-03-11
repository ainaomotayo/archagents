import { describe, it, expect, vi } from "vitest";
import { resolveProviders } from "../routes/auth-discovery.js";
import { mapScimUserToSentinel, mapScimGroupsToRole, parseScimListParams } from "../routes/scim.js";
import { rotateOrgKeys } from "../routes/encryption-admin.js";
import { resolveApiKeyAuth } from "../middleware/auth.js";

// ---------------------------------------------------------------------------
// Auth Discovery edge cases
// ---------------------------------------------------------------------------
describe("resolveProviders edge cases", () => {
  it("returns default providers when email has no @ symbol", async () => {
    const lookup = vi.fn();
    const result = await resolveProviders("no-at-symbol", lookup);
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0].id).toBe("github");
    expect(result.orgId).toBeUndefined();
    // lookup should never be called for invalid emails
    expect(lookup).not.toHaveBeenCalled();
  });

  it("returns default providers when org has empty providers array", async () => {
    const lookup = async (_domain: string) => ({
      orgId: "org-empty",
      orgName: "Empty Corp",
      providers: [] as { id: string; name: string; enforced: boolean }[],
    });
    const result = await resolveProviders("user@empty.com", lookup);
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0].id).toBe("github");
    expect(result.orgId).toBeUndefined();
  });

  it("filters to only enforced providers when SSO is enforced", async () => {
    const lookup = async (_domain: string) => ({
      orgId: "org-enforced",
      orgName: "Enforced Corp",
      providers: [
        { id: "oidc", name: "Corp SSO", enforced: true },
        { id: "saml", name: "Backup SAML", enforced: false },
      ],
    });
    const result = await resolveProviders("user@enforced.com", lookup);
    expect(result.enforced).toBe(true);
    // Only the enforced provider should be returned (no defaults appended)
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0].id).toBe("oidc");
  });
});

// ---------------------------------------------------------------------------
// SCIM mapper edge cases
// ---------------------------------------------------------------------------
describe("mapScimUserToSentinel edge cases", () => {
  it("handles missing name object entirely", () => {
    const scimUser = {
      userName: "bob@acme.com",
      emails: [{ value: "bob@acme.com", primary: true }],
    };
    const result = mapScimUserToSentinel(scimUser);
    expect(result.email).toBe("bob@acme.com");
    // Falls back to userName when name is missing
    expect(result.name).toBe("bob@acme.com");
  });

  it("handles name with only givenName (no familyName)", () => {
    const scimUser = {
      userName: "mono@acme.com",
      name: { givenName: "Mono" },
      emails: [{ value: "mono@acme.com", primary: true }],
    };
    const result = mapScimUserToSentinel(scimUser);
    expect(result.name).toBe("Mono");
  });

  it("handles name with only familyName (no givenName)", () => {
    const scimUser = {
      userName: "smith@acme.com",
      name: { familyName: "Smith" },
      emails: [{ value: "smith@acme.com", primary: true }],
    };
    const result = mapScimUserToSentinel(scimUser);
    expect(result.name).toBe("Smith");
  });

  it("handles name with both fields undefined", () => {
    const scimUser = {
      userName: "anon@acme.com",
      name: {},
      emails: [{ value: "anon@acme.com", primary: true }],
    };
    const result = mapScimUserToSentinel(scimUser);
    // Empty name object with no givenName/familyName results in empty string
    // which falls through the truthy check - but trim() gives ""
    // The code: `${undefined ?? ""} ${undefined ?? ""}`.trim() => ""
    // However name object is truthy, so it uses the template
    expect(result.name).toBe("");
  });

  it("falls back to userName when emails array is empty", () => {
    const scimUser = {
      userName: "fallback@acme.com",
      name: { givenName: "Fall", familyName: "Back" },
      emails: [],
    };
    const result = mapScimUserToSentinel(scimUser);
    expect(result.email).toBe("fallback@acme.com");
  });

  it("uses externalId from scimUser.id when externalId is absent", () => {
    const scimUser = {
      id: "ext-from-id",
      userName: "ext@acme.com",
      emails: [{ value: "ext@acme.com", primary: true }],
    };
    const result = mapScimUserToSentinel(scimUser);
    expect(result.externalId).toBe("ext-from-id");
  });
});

describe("mapScimGroupsToRole edge cases", () => {
  it("returns default role for empty groups array", () => {
    const mapping = { engineering: "developer", security: "admin" };
    const role = mapScimGroupsToRole([], mapping, "viewer");
    expect(role).toBe("viewer");
  });

  it("returns default role when no mapping matches any group", () => {
    const groups = ["marketing", "sales", "support"];
    const mapping = { engineering: "developer", security: "admin" };
    const role = mapScimGroupsToRole(groups, mapping, "viewer");
    expect(role).toBe("viewer");
  });

  it("selects highest-priority role when multiple groups match", () => {
    const groups = ["engineering", "security"];
    const mapping = { engineering: "developer", security: "admin" };
    const role = mapScimGroupsToRole(groups, mapping, "viewer");
    expect(role).toBe("admin");
  });

  it("returns default when mapping is empty object", () => {
    const groups = ["engineering"];
    const role = mapScimGroupsToRole(groups, {}, "service");
    expect(role).toBe("service");
  });
});

// ---------------------------------------------------------------------------
// SCIM pagination edge cases
// ---------------------------------------------------------------------------
describe("parseScimListParams edge cases", () => {
  it("negative startIndex defaults to 1", () => {
    const result = parseScimListParams({ startIndex: "-5" });
    expect(result.startIndex).toBe(1);
    expect(result.skip).toBe(0);
  });

  it("zero startIndex defaults to 1", () => {
    const result = parseScimListParams({ startIndex: "0" });
    expect(result.startIndex).toBe(1);
    expect(result.skip).toBe(0);
  });

  it("zero count falls back to default 100 (parseInt 0 is falsy)", () => {
    // parseInt("0") === 0, which is falsy, so || 100 kicks in
    const result = parseScimListParams({ count: "0" });
    expect(result.count).toBe(100);
    expect(result.take).toBe(100);
  });

  it("negative count defaults to minimum of 1", () => {
    const result = parseScimListParams({ count: "-10" });
    expect(result.count).toBe(1);
    expect(result.take).toBe(1);
  });

  it("non-numeric startIndex falls back to 1", () => {
    const result = parseScimListParams({ startIndex: "abc" });
    expect(result.startIndex).toBe(1);
    expect(result.skip).toBe(0);
  });

  it("non-numeric count falls back to 100", () => {
    const result = parseScimListParams({ count: "xyz" });
    expect(result.count).toBe(100);
    expect(result.take).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Encryption admin edge cases
// ---------------------------------------------------------------------------
describe("rotateOrgKeys edge cases", () => {
  it("returns empty array when given empty keys array", async () => {
    const mockKms = {
      rewrapDataKey: vi.fn(),
    };
    const results = await rotateOrgKeys([], mockKms as any, "kek-1");
    expect(results).toEqual([]);
    expect(mockKms.rewrapDataKey).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Auth middleware edge cases
// ---------------------------------------------------------------------------
describe("resolveApiKeyAuth edge cases", () => {
  it("returns null for expired key", async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // yesterday
    const lookup = vi.fn().mockResolvedValue({
      keyHash: "abc",
      keySalt: "def",
      orgId: "org-1",
      role: "developer",
      revokedAt: null,
      expiresAt: pastDate,
    });
    const result = await resolveApiKeyAuth("Bearer sk_abc12345rest", lookup);
    expect(result).toBeNull();
  });

  it("returns null for revoked key", async () => {
    const lookup = vi.fn().mockResolvedValue({
      keyHash: "abc",
      keySalt: "def",
      orgId: "org-1",
      role: "developer",
      revokedAt: new Date().toISOString(),
      expiresAt: null,
    });
    const result = await resolveApiKeyAuth("Bearer sk_abc12345rest", lookup);
    expect(result).toBeNull();
  });

  it("returns null for Bearer token without sk_ prefix", async () => {
    const lookup = vi.fn();
    const result = await resolveApiKeyAuth("Bearer pat_abc12345", lookup);
    expect(result).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("returns null for Basic auth scheme", async () => {
    const lookup = vi.fn();
    const result = await resolveApiKeyAuth("Basic dXNlcjpwYXNz", lookup);
    expect(result).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("returns null when lookup returns no record", async () => {
    const lookup = vi.fn().mockResolvedValue(null);
    const result = await resolveApiKeyAuth("Bearer sk_unknown_key", lookup);
    expect(result).toBeNull();
    expect(lookup).toHaveBeenCalledWith("sk_unkno");
  });
});
