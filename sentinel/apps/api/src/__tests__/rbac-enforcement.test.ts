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

  it("returns false for completely unknown paths", () => {
    expect(isAuthorized("admin", "GET", "/v1/nonexistent")).toBe(false);
  });

  it("GET /v1/policies/:id/versions accessible by all authenticated roles", () => {
    expect(isAuthorized("admin", "GET", "/v1/policies/:id/versions")).toBe(true);
    expect(isAuthorized("viewer", "GET", "/v1/policies/:id/versions")).toBe(true);
    expect(isAuthorized("service", "GET", "/v1/policies/:id/versions")).toBe(false);
  });

  it("viewer can read compliance scores but not create frameworks", () => {
    expect(isAuthorized("viewer", "GET", "/v1/compliance/scores")).toBe(true);
    expect(isAuthorized("viewer", "GET", "/v1/compliance/frameworks")).toBe(true);
    expect(isAuthorized("viewer", "POST", "/v1/compliance/frameworks")).toBe(false);
  });

  it("only admin can create/update/delete compliance frameworks", () => {
    expect(isAuthorized("admin", "POST", "/v1/compliance/frameworks")).toBe(true);
    expect(isAuthorized("admin", "PUT", "/v1/compliance/frameworks/:id")).toBe(true);
    expect(isAuthorized("admin", "DELETE", "/v1/compliance/frameworks/:id")).toBe(true);
    expect(isAuthorized("manager", "POST", "/v1/compliance/frameworks")).toBe(false);
  });

  it("admin and manager can override controls", () => {
    expect(isAuthorized("admin", "POST", "/v1/compliance/controls/:id/override")).toBe(true);
    expect(isAuthorized("manager", "POST", "/v1/compliance/controls/:id/override")).toBe(true);
    expect(isAuthorized("developer", "POST", "/v1/compliance/controls/:id/override")).toBe(false);
  });

  it("only admin can verify evidence chain", () => {
    expect(isAuthorized("admin", "GET", "/v1/evidence/verify")).toBe(true);
    expect(isAuthorized("manager", "GET", "/v1/evidence/verify")).toBe(false);
  });

  it("admin and manager can manage reports", () => {
    expect(isAuthorized("admin", "POST", "/v1/reports")).toBe(true);
    expect(isAuthorized("manager", "GET", "/v1/reports")).toBe(true);
    expect(isAuthorized("developer", "POST", "/v1/reports")).toBe(false);
  });

  it("developer can run live assessments", () => {
    expect(isAuthorized("developer", "GET", "/v1/compliance/assess/:frameworkId")).toBe(true);
    expect(isAuthorized("viewer", "GET", "/v1/compliance/assess/:frameworkId")).toBe(false);
  });

  it("only admin can create/update/delete webhooks", () => {
    expect(isAuthorized("admin", "POST", "/v1/webhooks")).toBe(true);
    expect(isAuthorized("admin", "PUT", "/v1/webhooks/:id")).toBe(true);
    expect(isAuthorized("admin", "DELETE", "/v1/webhooks/:id")).toBe(true);
    expect(isAuthorized("manager", "POST", "/v1/webhooks")).toBe(false);
    expect(isAuthorized("developer", "POST", "/v1/webhooks")).toBe(false);
  });

  it("admin and manager can list webhooks and deliveries", () => {
    expect(isAuthorized("admin", "GET", "/v1/webhooks")).toBe(true);
    expect(isAuthorized("manager", "GET", "/v1/webhooks")).toBe(true);
    expect(isAuthorized("admin", "GET", "/v1/webhooks/:id")).toBe(true);
    expect(isAuthorized("manager", "GET", "/v1/webhooks/:id")).toBe(true);
    expect(isAuthorized("admin", "GET", "/v1/webhooks/:id/deliveries")).toBe(true);
    expect(isAuthorized("developer", "GET", "/v1/webhooks")).toBe(false);
  });

  it("admin can test webhook endpoints", () => {
    expect(isAuthorized("admin", "POST", "/v1/webhooks/:id/test")).toBe(true);
    expect(isAuthorized("manager", "POST", "/v1/webhooks/:id/test")).toBe(false);
  });

  it("admin and manager can manage notification rules", () => {
    expect(isAuthorized("admin", "POST", "/v1/notifications/rules")).toBe(true);
    expect(isAuthorized("manager", "POST", "/v1/notifications/rules")).toBe(true);
    expect(isAuthorized("admin", "GET", "/v1/notifications/rules")).toBe(true);
    expect(isAuthorized("admin", "DELETE", "/v1/notifications/rules/:id")).toBe(true);
    expect(isAuthorized("developer", "POST", "/v1/notifications/rules")).toBe(false);
  });

  it("all authenticated users can access SSE stream", () => {
    expect(isAuthorized("admin", "GET", "/v1/events/stream")).toBe(true);
    expect(isAuthorized("manager", "GET", "/v1/events/stream")).toBe(true);
    expect(isAuthorized("developer", "GET", "/v1/events/stream")).toBe(true);
    expect(isAuthorized("viewer", "GET", "/v1/events/stream")).toBe(true);
    expect(isAuthorized("service", "GET", "/v1/events/stream")).toBe(true);
  });
});
