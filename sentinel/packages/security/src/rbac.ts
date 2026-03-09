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
  { method: "GET", path: "/v1/certificates", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/certificates/:id", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "POST", path: "/v1/certificates/:id/verify", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "POST", path: "/v1/certificates/:id/revoke", roles: ["admin", "manager"] },
  { method: "GET", path: "/v1/projects", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/projects/:id", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "GET", path: "/v1/policies", roles: ["admin", "manager", "developer", "viewer"] },
  { method: "POST", path: "/v1/policies", roles: ["admin", "manager"] },
  { method: "PUT", path: "/v1/policies", roles: ["admin", "manager"] },
  { method: "DELETE", path: "/v1/policies", roles: ["admin"] },
  { method: "GET", path: "/v1/audit", roles: ["admin", "manager"] },
  { method: "POST", path: "/v1/orgs/purge", roles: ["admin"] },
  { method: "GET", path: "/v1/admin/dlq", roles: ["admin"] },
];

/**
 * Check whether a given role is authorized to access a specific endpoint.
 * Returns false for unknown roles or unregistered endpoints.
 */
export function isAuthorized(role: ApiRole, method: string, path: string): boolean {
  const permission = API_PERMISSIONS.find(
    (p) => p.method === method.toUpperCase() && p.path === path,
  );
  if (!permission) {
    return false;
  }
  return permission.roles.includes(role);
}

/**
 * Return all endpoints a given role is permitted to access.
 */
export function getPermittedEndpoints(role: ApiRole): EndpointPermission[] {
  return API_PERMISSIONS.filter((p) => p.roles.includes(role));
}
