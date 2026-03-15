import { describe, it, expect } from "vitest";
import { buildScimGroupResource, parseGroupPatchOps, SCIM_GROUP_SCHEMA } from "../routes/scim.js";

describe("SCIM Groups helpers", () => {
  it("buildScimGroupResource formats a group for SCIM response", () => {
    const resource = buildScimGroupResource("group-1", "Engineering", [
      { value: "user-1", display: "Alice" },
    ]);
    expect(resource.schemas).toContain("urn:ietf:params:scim:schemas:core:2.0:Group");
    expect(resource.id).toBe("group-1");
    expect(resource.displayName).toBe("Engineering");
    expect(resource.members).toHaveLength(1);
    expect(resource.members[0].value).toBe("user-1");
  });

  it("parseGroupPatchOps extracts add/remove member operations", () => {
    const ops = [
      { op: "add", path: "members", value: [{ value: "user-2" }] },
      { op: "remove", path: 'members[value eq "user-1"]' },
    ];
    const result = parseGroupPatchOps(ops);
    expect(result.addMembers).toEqual(["user-2"]);
    expect(result.removeMembers).toEqual(["user-1"]);
  });

  it("parseGroupPatchOps handles displayName replace", () => {
    const ops = [{ op: "replace", path: "displayName", value: "New Name" }];
    const result = parseGroupPatchOps(ops);
    expect(result.displayName).toBe("New Name");
  });

  it("parseGroupPatchOps handles empty operations", () => {
    const result = parseGroupPatchOps([]);
    expect(result.addMembers).toEqual([]);
    expect(result.removeMembers).toEqual([]);
    expect(result.displayName).toBeUndefined();
  });

  it("buildScimGroupResource handles empty members", () => {
    const resource = buildScimGroupResource("admin", "admin", []);
    expect(resource.members).toEqual([]);
    expect(resource.meta.resourceType).toBe("Group");
  });

  it("SCIM_GROUP_SCHEMA has correct structure", () => {
    expect(SCIM_GROUP_SCHEMA.id).toBe("urn:ietf:params:scim:schemas:core:2.0:Group");
    expect(SCIM_GROUP_SCHEMA.attributes).toBeDefined();
    expect(SCIM_GROUP_SCHEMA.attributes.length).toBeGreaterThan(0);
  });
});
