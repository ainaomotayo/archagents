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
  { method: "GET", path: "/v1/evidence", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/evidence/:id", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/evidence/verify", roles: ["admin"] },
  { method: "POST", path: "/v1/reports", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/reports", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/reports/:id", roles: ["admin", "manager"] },
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
