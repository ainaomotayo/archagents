export type ApiRole = "admin" | "manager" | "developer" | "viewer" | "service";

export interface EndpointPermission {
  method: string;
  path: string;
  roles: ApiRole[];
}

export const API_PERMISSIONS: EndpointPermission[] = [
  { method: "POST", path: "/v1/scans", roles: ["admin", "manager", "developer", "service"] },
  { method: "GET", path: "/v1/scans", roles: ["admin", "manager", "developer", "viewer", "service"] },
  { method: "GET", path: "/v1/scans/:id", roles: ["admin", "manager", "developer", "viewer", "service"] },
  { method: "GET", path: "/v1/scans/:id/poll", roles: ["admin", "manager", "developer", "viewer", "service"] },
  { method: "GET", path: "/v1/findings", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/findings/:id", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "PATCH", path: "/v1/findings/:id", roles: ["admin", "manager", "developer"] },
  { method: "GET", path: "/v1/certificates", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/certificates/:id", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "POST", path: "/v1/certificates/:id/verify", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "POST", path: "/v1/certificates/:id/revoke", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/projects", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/projects/:id", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/projects/:id/findings", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/policies", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/policies/:id", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "POST", path: "/v1/policies", roles: ["admin", "manager"] },
  { method: "PUT", path: "/v1/policies/:id", roles: ["admin", "manager"] },
  { method: "DELETE", path: "/v1/policies/:id", roles: ["admin"] },
  { method: "GET", path: "/v1/audit", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/policies/:id/versions", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/admin/dlq", roles: ["admin"] },

  // Compliance
  { method: "GET", path: "/v1/compliance/frameworks", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/compliance/frameworks/:id", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "POST", path: "/v1/compliance/frameworks", roles: ["admin"] },
  { method: "PUT", path: "/v1/compliance/frameworks/:id", roles: ["admin"] },
  { method: "DELETE", path: "/v1/compliance/frameworks/:id", roles: ["admin"] },
  { method: "POST", path: "/v1/compliance/controls/:id/override", roles: ["admin", "manager"] },
  { method: "DELETE", path: "/v1/compliance/controls/:id/override", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/compliance/assess/:frameworkId", roles: ["admin", "manager", "developer"] },
  { method: "GET", path: "/v1/compliance/scores", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/compliance/trends/:frameworkId", roles: ["admin", "manager", "developer", "viewer"] },
  // Attestations
  { method: "POST", path: "/v1/compliance/attestations", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/compliance/attestations", roles: ["admin", "manager", "developer"] },
  { method: "GET", path: "/v1/compliance/attestations/expiring", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/compliance/attestations/:id", roles: ["admin", "manager", "developer"] },
  { method: "DELETE", path: "/v1/compliance/attestations/:id", roles: ["admin"] },
  { method: "POST", path: "/v1/compliance/attestations/:id/renew", roles: ["admin", "manager"] },
  // Gap Analysis
  { method: "GET", path: "/v1/compliance/gaps/:frameworkSlug", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/compliance/gaps/:frameworkSlug/export", roles: ["admin", "manager"] },
  // Dashboard
  { method: "GET", path: "/v1/compliance/dashboard", roles: ["admin", "manager", "developer"] },
  // Remediations
  { method: "POST", path: "/v1/compliance/remediations", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/compliance/remediations", roles: ["admin", "manager", "developer"] },
  { method: "GET", path: "/v1/compliance/remediations/overdue", roles: ["admin", "manager"] },
  { method: "PATCH", path: "/v1/compliance/remediations/:id", roles: ["admin", "manager"] },
  // Business Associate Agreements
  { method: "POST", path: "/v1/compliance/baa", roles: ["admin"] },
  { method: "GET", path: "/v1/compliance/baa", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/compliance/baa/expiring", roles: ["admin", "manager"] },
  { method: "PATCH", path: "/v1/compliance/baa/:id", roles: ["admin"] },
  { method: "DELETE", path: "/v1/compliance/baa/:id", roles: ["admin"] },
  { method: "GET", path: "/v1/evidence", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/evidence/:id", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/evidence/verify", roles: ["admin"] },
  { method: "POST", path: "/v1/reports", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/reports", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/reports/:id", roles: ["admin", "manager"] },
  // Webhooks
  { method: "POST", path: "/v1/webhooks", roles: ["admin"] },
  { method: "GET", path: "/v1/webhooks", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/webhooks/:id", roles: ["admin", "manager"] },
  { method: "PUT", path: "/v1/webhooks/:id", roles: ["admin"] },
  { method: "DELETE", path: "/v1/webhooks/:id", roles: ["admin"] },
  { method: "POST", path: "/v1/webhooks/:id/test", roles: ["admin"] },
  { method: "GET", path: "/v1/webhooks/:id/deliveries", roles: ["admin", "manager"] },
  // Notification rules
  { method: "POST", path: "/v1/notifications/rules", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/notifications/rules", roles: ["admin", "manager"] },
  { method: "DELETE", path: "/v1/notifications/rules/:id", roles: ["admin", "manager"] },
  // SSE stream
  { method: "GET", path: "/v1/events/stream", roles: ["admin", "manager", "developer", "viewer", "service"] },
  // P10: API Keys
  { method: "POST", path: "/v1/api-keys", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/api-keys", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "DELETE", path: "/v1/api-keys/:id", roles: ["admin", "manager"] },
  // P10: SSO Config
  { method: "GET", path: "/v1/sso-configs", roles: ["admin", "manager"] },
  { method: "POST", path: "/v1/sso-configs", roles: ["admin"] },
  { method: "PUT", path: "/v1/sso-configs/:id", roles: ["admin"] },
  { method: "DELETE", path: "/v1/sso-configs/:id", roles: ["admin"] },
  { method: "POST", path: "/v1/sso-configs/:id/scim-token", roles: ["admin"] },
  // P10: Org Memberships
  { method: "GET", path: "/v1/memberships", roles: ["admin", "manager"] },
  { method: "POST", path: "/v1/memberships", roles: ["admin"] },
  { method: "PUT", path: "/v1/memberships/:id", roles: ["admin"] },
  { method: "DELETE", path: "/v1/memberships/:id", roles: ["admin"] },
  // P10: Encryption Admin
  { method: "POST", path: "/v1/admin/rotate-keys", roles: ["admin"] },
  { method: "POST", path: "/v1/admin/crypto-shred", roles: ["admin"] },
  // Approval Workflows
  { method: "POST", path: "/v1/approval-policies", roles: ["admin"] },
  { method: "GET", path: "/v1/approval-policies", roles: ["admin", "manager"] },
  { method: "PATCH", path: "/v1/approval-policies/:id", roles: ["admin"] },
  { method: "DELETE", path: "/v1/approval-policies/:id", roles: ["admin"] },
  { method: "GET", path: "/v1/approvals", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/approvals/stats", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/approvals/:id", roles: ["admin", "manager", "developer"] },
  { method: "POST", path: "/v1/approvals/:id/decide", roles: ["admin", "manager"] },
  { method: "POST", path: "/v1/approvals/:id/reassign", roles: ["admin"] },
  // Domains
  { method: "GET", path: "/v1/domains", roles: ["admin", "manager"] },
  { method: "POST", path: "/v1/domains", roles: ["admin"] },
  { method: "POST", path: "/v1/domains/:domain/verify", roles: ["admin"] },
  { method: "DELETE", path: "/v1/domains/:domain", roles: ["admin"] },
];

/** Pre-computed HashMap for O(1) authorization lookups. */
const PERMISSION_MAP: Map<string, Set<ApiRole>> = new Map(
  API_PERMISSIONS.map((p) => [`${p.method}:${p.path}`, new Set(p.roles)]),
);

/**
 * Check whether a given role is authorized to access a specific endpoint.
 * Returns false for unknown roles or unregistered endpoints.
 */
export function isAuthorized(role: ApiRole, method: string, path: string): boolean {
  const roles = PERMISSION_MAP.get(`${method.toUpperCase()}:${path}`);
  return roles?.has(role) ?? false;
}

/**
 * Return all endpoints a given role is permitted to access.
 */
export function getPermittedEndpoints(role: ApiRole): EndpointPermission[] {
  return API_PERMISSIONS.filter((p) => p.roles.includes(role));
}
