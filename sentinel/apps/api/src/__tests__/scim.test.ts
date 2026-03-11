import { describe, it, expect } from "vitest";
import { mapScimUserToSentinel, mapScimGroupsToRole, parseScimListParams, parseScimFilter } from "../routes/scim.js";

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
