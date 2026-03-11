import { describe, it, expect } from "vitest";
import { mapScimUserToSentinel, mapScimGroupsToRole } from "../routes/scim.js";

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
