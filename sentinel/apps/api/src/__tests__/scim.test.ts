import { describe, it, expect } from "vitest";
import { mapScimUserToSentinel, mapScimGroupsToRole, parseScimListParams, parseScimFilter, applyScimPatchOps, SCIM_USER_SCHEMA } from "../routes/scim.js";

describe("SCIM User Mapping", () => {
  it("maps SCIM user to Sentinel user fields", () => {
    const scimUser = {
      userName: "alice@acme.com",
      name: { givenName: "Alice", familyName: "Smith" },
      emails: [{ value: "alice@acme.com", primary: true }],
      active: true,
    };
    const result = mapScimUserToSentinel(scimUser);
    expect(result.email).toBe("alice@acme.com");
    expect(result.name).toBe("Alice Smith");
  });

  it("maps SCIM groups to Sentinel role", () => {
    const groups = ["engineering", "security-team"];
    const mapping = { "engineering": "developer", "security-team": "manager" };
    const role = mapScimGroupsToRole(groups, mapping, "viewer");
    expect(role).toBe("manager");
  });

  it("returns default role when no groups match", () => {
    const groups = ["marketing"];
    const mapping = { "engineering": "developer" };
    const role = mapScimGroupsToRole(groups, mapping, "viewer");
    expect(role).toBe("viewer");
  });
});

describe("SCIM pagination", () => {
  it("parseScimListParams extracts startIndex and count", () => {
    expect(parseScimListParams({ startIndex: "5", count: "10" }))
      .toEqual({ startIndex: 5, count: 10, skip: 4, take: 10 });
  });

  it("defaults to startIndex=1, count=100", () => {
    expect(parseScimListParams({}))
      .toEqual({ startIndex: 1, count: 100, skip: 0, take: 100 });
  });

  it("clamps count to max 200", () => {
    expect(parseScimListParams({ count: "999" }).count).toBe(200);
  });

  it("parseScimFilter parses userName eq filter", () => {
    expect(parseScimFilter('userName eq "alice@acme.com"'))
      .toEqual({ field: "email", value: "alice@acme.com" });
  });

  it("parseScimFilter returns null for unsupported filter", () => {
    expect(parseScimFilter('displayName co "alice"')).toBeNull();
  });
});

describe("SCIM PATCH operations", () => {
  it("handles replace on name fields", () => {
    const updates = applyScimPatchOps([
      { op: "replace", path: "name.givenName", value: "Alice" },
      { op: "replace", path: "name.familyName", value: "Smith" },
    ]);
    expect(updates.name).toBe("Alice Smith");
    expect(updates.deactivate).toBeUndefined();
  });

  it("handles replace active=false as deactivate", () => {
    const updates = applyScimPatchOps([
      { op: "replace", path: "active", value: false },
    ]);
    expect(updates.deactivate).toBe(true);
  });

  it("handles case-insensitive op", () => {
    const updates = applyScimPatchOps([
      { op: "Replace", path: "externalId", value: "ext-123" },
    ]);
    expect(updates.externalId).toBe("ext-123");
  });

  it("handles active=false as string", () => {
    const updates = applyScimPatchOps([
      { op: "replace", path: "active", value: "false" },
    ]);
    expect(updates.deactivate).toBe(true);
  });

  it("returns empty object for unknown ops", () => {
    const updates = applyScimPatchOps([
      { op: "add", path: "displayName", value: "Alice" },
    ]);
    expect(updates).toEqual({});
  });
});

describe("SCIM discovery endpoints", () => {
  it("SCIM_USER_SCHEMA has required attributes", () => {
    expect(SCIM_USER_SCHEMA.id).toBe("urn:ietf:params:scim:schemas:core:2.0:User");
    const attrNames = SCIM_USER_SCHEMA.attributes.map((a: any) => a.name);
    expect(attrNames).toContain("userName");
    expect(attrNames).toContain("name");
    expect(attrNames).toContain("emails");
    expect(attrNames).toContain("active");
    expect(attrNames).toContain("externalId");
  });
});
