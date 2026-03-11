import { describe, it, expect } from "vitest";
import { resolveRoleFromDb } from "../role-resolver.js";

describe("DB-backed Role Resolution", () => {
  it("returns DB role when membership exists", async () => {
    const lookup = async () => ({ role: "admin", source: "manual" });
    const role = await resolveRoleFromDb("user-1", "org-1", lookup, "viewer:default");
    expect(role).toBe("admin");
  });

  it("falls back to env-var mapping when no DB membership", async () => {
    const lookup = async () => null;
    const role = await resolveRoleFromDb("user-1", "org-1", lookup, "admin:alice;dev:bob", "alice");
    expect(role).toBe("admin");
  });

  it("returns viewer when no DB membership and no env mapping", async () => {
    const lookup = async () => null;
    const role = await resolveRoleFromDb("user-1", "org-1", lookup, "admin:alice", "unknown");
    expect(role).toBe("viewer");
  });

  it("is case-insensitive for env-var matching", async () => {
    const lookup = async () => null;
    const role = await resolveRoleFromDb("user-1", "org-1", lookup, "admin:Alice", "alice");
    expect(role).toBe("admin");
  });

  it("DB membership overrides env-var mapping", async () => {
    const lookup = async () => ({ role: "developer", source: "scim" });
    const role = await resolveRoleFromDb("user-1", "org-1", lookup, "admin:alice", "alice");
    expect(role).toBe("developer");
  });
});
