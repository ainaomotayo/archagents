import { describe, it, expect } from "vitest";
import { isAuthorized } from "@sentinel/security";

describe("RBAC enforcement", () => {
  it("admin can access all endpoints", () => {
    expect(isAuthorized("admin", "POST", "/v1/scans")).toBe(true);
    expect(isAuthorized("admin", "GET", "/v1/audit")).toBe(true);
    expect(isAuthorized("admin", "POST", "/v1/certificates/:id/revoke")).toBe(true);
    expect(isAuthorized("admin", "GET", "/v1/admin/dlq")).toBe(true);
  });

  it("viewer can read but not write", () => {
    expect(isAuthorized("viewer", "GET", "/v1/findings")).toBe(true);
    expect(isAuthorized("viewer", "GET", "/v1/certificates")).toBe(true);
    expect(isAuthorized("viewer", "POST", "/v1/scans")).toBe(false);
    expect(isAuthorized("viewer", "POST", "/v1/policies")).toBe(false);
  });

  it("developer can submit scans but not revoke certs", () => {
    expect(isAuthorized("developer", "POST", "/v1/scans")).toBe(true);
    expect(isAuthorized("developer", "POST", "/v1/certificates/:id/revoke")).toBe(false);
  });

  it("manager can revoke certificates", () => {
    expect(isAuthorized("manager", "POST", "/v1/certificates/:id/revoke")).toBe(true);
  });

  it("viewer cannot access audit log", () => {
    expect(isAuthorized("viewer", "GET", "/v1/audit")).toBe(false);
  });

  it("only admin can access DLQ", () => {
    expect(isAuthorized("admin", "GET", "/v1/admin/dlq")).toBe(true);
    expect(isAuthorized("manager", "GET", "/v1/admin/dlq")).toBe(false);
    expect(isAuthorized("developer", "GET", "/v1/admin/dlq")).toBe(false);
  });

  it("PUT /v1/policies/:id requires admin or manager", () => {
    expect(isAuthorized("admin", "PUT", "/v1/policies/:id")).toBe(true);
    expect(isAuthorized("manager", "PUT", "/v1/policies/:id")).toBe(true);
    expect(isAuthorized("developer", "PUT", "/v1/policies/:id")).toBe(false);
    expect(isAuthorized("viewer", "PUT", "/v1/policies/:id")).toBe(false);
  });

  it("DELETE /v1/policies/:id requires admin only", () => {
    expect(isAuthorized("admin", "DELETE", "/v1/policies/:id")).toBe(true);
    expect(isAuthorized("manager", "DELETE", "/v1/policies/:id")).toBe(false);
    expect(isAuthorized("developer", "DELETE", "/v1/policies/:id")).toBe(false);
    expect(isAuthorized("viewer", "DELETE", "/v1/policies/:id")).toBe(false);
  });

  it("GET /v1/projects/:id/findings is accessible by all authenticated roles", () => {
    expect(isAuthorized("admin", "GET", "/v1/projects/:id/findings")).toBe(true);
    expect(isAuthorized("viewer", "GET", "/v1/projects/:id/findings")).toBe(true);
    expect(isAuthorized("service", "GET", "/v1/projects/:id/findings")).toBe(false);
  });

  it("service role can submit and read scans", () => {
    expect(isAuthorized("service", "POST", "/v1/scans")).toBe(true);
    expect(isAuthorized("service", "GET", "/v1/scans")).toBe(true);
    expect(isAuthorized("service", "GET", "/v1/scans/:id/poll")).toBe(true);
  });
});
