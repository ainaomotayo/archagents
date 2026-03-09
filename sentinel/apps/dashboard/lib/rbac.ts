/**
 * SENTINEL Dashboard — Role-Based Access Control
 *
 * Defines roles, route permissions, and access-check helpers.
 */

export type Role = "admin" | "manager" | "dev" | "viewer";

export interface RoutePermission {
  path: string;
  roles: Role[];
}

/**
 * Route permissions ordered from most-specific to least-specific.
 * The first matching prefix wins, so more restrictive routes must
 * come before the catch-all `/dashboard`.
 */
export const ROUTE_PERMISSIONS: RoutePermission[] = [
  { path: "/dashboard/settings", roles: ["admin"] },
  { path: "/dashboard/policies", roles: ["admin", "manager"] },
  { path: "/dashboard/audit", roles: ["admin", "manager"] },
  { path: "/dashboard/projects", roles: ["admin", "manager", "dev"] },
  { path: "/dashboard/findings", roles: ["admin", "manager", "dev"] },
  { path: "/dashboard/certificates", roles: ["admin", "manager", "dev", "viewer"] },
  { path: "/dashboard", roles: ["admin", "manager", "dev", "viewer"] },
];

/**
 * All navigation items shown in the sidebar.
 * `href` doubles as the route-permission key.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: string; // placeholder icon name
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: "home" },
  { label: "Projects", href: "/dashboard/projects", icon: "folder" },
  { label: "Findings", href: "/dashboard/findings", icon: "search" },
  { label: "Certificates", href: "/dashboard/certificates", icon: "shield" },
  { label: "Policies", href: "/dashboard/policies", icon: "file-text" },
  { label: "Audit Log", href: "/dashboard/audit", icon: "clock" },
  { label: "Settings", href: "/dashboard/settings", icon: "settings" },
];

/**
 * Check whether a user with `userRole` may access `path`.
 *
 * Matches the longest prefix in ROUTE_PERMISSIONS.
 * If no rule matches the path, access is denied by default.
 */
export function canAccess(userRole: Role, path: string): boolean {
  const normalised = path.replace(/\/+$/, "") || "/dashboard";

  for (const rule of ROUTE_PERMISSIONS) {
    if (normalised === rule.path || normalised.startsWith(rule.path + "/")) {
      return rule.roles.includes(userRole);
    }
  }

  // No matching rule — deny by default
  return false;
}

/**
 * Return the top-level routes a given role may access.
 */
export function getAccessibleRoutes(userRole: Role): string[] {
  return ROUTE_PERMISSIONS.filter((r) => r.roles.includes(userRole)).map(
    (r) => r.path,
  );
}

/**
 * Filter NAV_ITEMS to only those the role may reach.
 */
export function getVisibleNavItems(userRole: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => canAccess(userRole, item.href));
}
