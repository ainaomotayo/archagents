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
  it("admin can access /settings", () => {
    expect(canAccess("admin", "/settings")).toBe(true);
  });

  it("viewer cannot access /settings", () => {
    expect(canAccess("viewer", "/settings")).toBe(false);
  });

  it("manager can access /policies", () => {
    expect(canAccess("manager", "/policies")).toBe(true);
  });

  it("dev cannot access /policies", () => {
    expect(canAccess("dev", "/policies")).toBe(false);
  });

  it("viewer can access / (overview)", () => {
    expect(canAccess("viewer", "/")).toBe(true);
  });

  it("all roles can access /", () => {
    const roles: Role[] = ["admin", "manager", "dev", "viewer"];
    for (const role of roles) {
      expect(canAccess(role, "/")).toBe(true);
    }
  });

  it("handles sub-paths under restricted routes", () => {
    expect(canAccess("admin", "/settings/profile")).toBe(true);
    expect(canAccess("viewer", "/settings/profile")).toBe(false);
  });

  it("handles trailing slashes", () => {
    expect(canAccess("admin", "/settings/")).toBe(true);
    expect(canAccess("viewer", "/settings/")).toBe(false);
  });

  it("denies access to unknown paths", () => {
    expect(canAccess("admin", "/unknown")).toBe(false);
    expect(canAccess("viewer", "/random/path")).toBe(false);
  });

  it("dev can access /projects", () => {
    expect(canAccess("dev", "/projects")).toBe(true);
  });

  it("viewer cannot access /audit", () => {
    expect(canAccess("viewer", "/audit")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAccessibleRoutes
// ---------------------------------------------------------------------------
describe("getAccessibleRoutes", () => {
  it("admin can access all routes", () => {
    const routes = getAccessibleRoutes("admin");
    expect(routes).toContain("/settings");
    expect(routes).toContain("/policies");
    expect(routes).toContain("/audit");
    expect(routes).toContain("/");
  });

  it("viewer can only access overview and certificates", () => {
    const routes = getAccessibleRoutes("viewer");
    expect(routes).toContain("/");
    expect(routes).toContain("/certificates");
    expect(routes).not.toContain("/settings");
    expect(routes).not.toContain("/policies");
    expect(routes).not.toContain("/audit");
  });

  it("dev can access projects and findings but not settings or policies", () => {
    const routes = getAccessibleRoutes("dev");
    expect(routes).toContain("/projects");
    expect(routes).toContain("/findings");
    expect(routes).not.toContain("/settings");
    expect(routes).not.toContain("/policies");
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
