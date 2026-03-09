import { describe, it, expect } from "vitest";
import { isAuthorized, getPermittedEndpoints, API_PERMISSIONS } from "./rbac.js";
import type { ApiRole } from "./rbac.js";

describe("rbac", () => {
  it("should allow admin access to all endpoints", () => {
    for (const perm of API_PERMISSIONS) {
      expect(isAuthorized("admin", perm.method, perm.path)).toBe(true);
    }
  });

  it("should restrict viewer to read-only endpoints", () => {
    expect(isAuthorized("viewer", "GET", "/v1/scans")).toBe(true);
    expect(isAuthorized("viewer", "GET", "/v1/findings")).toBe(true);
    expect(isAuthorized("viewer", "GET", "/v1/certificates")).toBe(true);

    // Viewer should NOT have write access
    expect(isAuthorized("viewer", "POST", "/v1/scans")).toBe(false);
    expect(isAuthorized("viewer", "POST", "/v1/policies")).toBe(false);
    expect(isAuthorized("viewer", "DELETE", "/v1/policies")).toBe(false);
    expect(isAuthorized("viewer", "POST", "/v1/orgs/purge")).toBe(false);
  });

  it("should allow service account to POST scans only", () => {
    expect(isAuthorized("service", "POST", "/v1/scans")).toBe(true);
    expect(isAuthorized("service", "GET", "/v1/scans")).toBe(false);
    expect(isAuthorized("service", "POST", "/v1/policies")).toBe(false);
  });

  it("should deny unknown endpoints", () => {
    expect(isAuthorized("admin", "GET", "/v1/nonexistent")).toBe(false);
  });

  it("should restrict DELETE /v1/policies to admin only", () => {
    expect(isAuthorized("admin", "DELETE", "/v1/policies")).toBe(true);
    expect(isAuthorized("manager", "DELETE", "/v1/policies")).toBe(false);
    expect(isAuthorized("developer", "DELETE", "/v1/policies")).toBe(false);
    expect(isAuthorized("viewer", "DELETE", "/v1/policies")).toBe(false);
  });

  it("should restrict purge to admin only", () => {
    expect(isAuthorized("admin", "POST", "/v1/orgs/purge")).toBe(true);
    expect(isAuthorized("manager", "POST", "/v1/orgs/purge")).toBe(false);
  });

  it("should allow manager to manage policies and certificates", () => {
    expect(isAuthorized("manager", "POST", "/v1/policies")).toBe(true);
    expect(isAuthorized("manager", "PUT", "/v1/policies")).toBe(true);
    expect(isAuthorized("manager", "POST", "/v1/certificates/revoke")).toBe(true);
  });

  it("should return all endpoints for admin via getPermittedEndpoints", () => {
    const endpoints = getPermittedEndpoints("admin");
    expect(endpoints.length).toBe(API_PERMISSIONS.length);
  });

  it("should return limited endpoints for viewer", () => {
    const endpoints = getPermittedEndpoints("viewer");
    expect(endpoints.length).toBe(3); // GET scans, findings, certificates
    for (const ep of endpoints) {
      expect(ep.method).toBe("GET");
    }
  });

  it("should handle case-insensitive method matching", () => {
    // isAuthorized normalizes method to uppercase
    expect(isAuthorized("admin", "get", "/v1/scans")).toBe(true);
    expect(isAuthorized("admin", "post", "/v1/scans")).toBe(true);
    expect(isAuthorized("admin", "delete", "/v1/policies")).toBe(true);
  });
});
