import { describe, it, expect } from "vitest";
import {
  canAccess,
  getAccessibleRoutes,
  getVisibleNavItems,
  NAV_ITEMS,
  type Role,
} from "../lib/rbac";

// ---------------------------------------------------------------------------
// canAccess
// ---------------------------------------------------------------------------
describe("canAccess", () => {
  it("admin can access /dashboard/settings", () => {
    expect(canAccess("admin", "/dashboard/settings")).toBe(true);
  });

  it("viewer cannot access /dashboard/settings", () => {
    expect(canAccess("viewer", "/dashboard/settings")).toBe(false);
  });

  it("manager can access /dashboard/policies", () => {
    expect(canAccess("manager", "/dashboard/policies")).toBe(true);
  });

  it("dev cannot access /dashboard/policies", () => {
    expect(canAccess("dev", "/dashboard/policies")).toBe(false);
  });

  it("viewer can access /dashboard (overview)", () => {
    expect(canAccess("viewer", "/dashboard")).toBe(true);
  });

  it("all roles can access /dashboard", () => {
    const roles: Role[] = ["admin", "manager", "dev", "viewer"];
    for (const role of roles) {
      expect(canAccess(role, "/dashboard")).toBe(true);
    }
  });

  it("handles sub-paths under restricted routes", () => {
    // /dashboard/settings/profile should match /dashboard/settings rule
    expect(canAccess("admin", "/dashboard/settings/profile")).toBe(true);
    expect(canAccess("viewer", "/dashboard/settings/profile")).toBe(false);
  });

  it("handles trailing slashes", () => {
    expect(canAccess("admin", "/dashboard/settings/")).toBe(true);
    expect(canAccess("viewer", "/dashboard/settings/")).toBe(false);
  });

  it("denies access to unknown paths", () => {
    expect(canAccess("admin", "/unknown")).toBe(false);
    expect(canAccess("viewer", "/random/path")).toBe(false);
  });

  it("dev can access /dashboard/projects", () => {
    expect(canAccess("dev", "/dashboard/projects")).toBe(true);
  });

  it("viewer cannot access /dashboard/audit", () => {
    expect(canAccess("viewer", "/dashboard/audit")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAccessibleRoutes
// ---------------------------------------------------------------------------
describe("getAccessibleRoutes", () => {
  it("admin can access all routes", () => {
    const routes = getAccessibleRoutes("admin");
    expect(routes).toContain("/dashboard/settings");
    expect(routes).toContain("/dashboard/policies");
    expect(routes).toContain("/dashboard/audit");
    expect(routes).toContain("/dashboard");
  });

  it("viewer can only access overview and certificates", () => {
    const routes = getAccessibleRoutes("viewer");
    expect(routes).toContain("/dashboard");
    expect(routes).toContain("/dashboard/certificates");
    expect(routes).not.toContain("/dashboard/settings");
    expect(routes).not.toContain("/dashboard/policies");
    expect(routes).not.toContain("/dashboard/audit");
  });

  it("dev can access projects and findings but not settings or policies", () => {
    const routes = getAccessibleRoutes("dev");
    expect(routes).toContain("/dashboard/projects");
    expect(routes).toContain("/dashboard/findings");
    expect(routes).not.toContain("/dashboard/settings");
    expect(routes).not.toContain("/dashboard/policies");
  });
});

// ---------------------------------------------------------------------------
// getVisibleNavItems
// ---------------------------------------------------------------------------
describe("getVisibleNavItems", () => {
  it("admin sees all nav items", () => {
    const items = getVisibleNavItems("admin");
    expect(items).toHaveLength(NAV_ITEMS.length);
  });

  it("viewer sees only Overview and Certificates", () => {
    const items = getVisibleNavItems("viewer");
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Overview");
    expect(labels).toContain("Certificates");
    expect(labels).not.toContain("Settings");
    expect(labels).not.toContain("Policies");
    expect(labels).not.toContain("Audit Log");
  });

  it("manager sees policies and audit but not settings", () => {
    const items = getVisibleNavItems("manager");
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Policies");
    expect(labels).toContain("Audit Log");
    expect(labels).not.toContain("Settings");
  });
});
