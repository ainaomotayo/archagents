/**
 * SENTINEL Dashboard — Role-Based Access Control
 *
 * Defines roles, route permissions, and access-check helpers.
 *
 * Note: The (dashboard) route group does NOT create a URL segment,
 * so all dashboard pages are served at the root (/, /findings, etc.).
 */

export type Role = "admin" | "manager" | "dev" | "viewer";

export interface RoutePermission {
  path: string;
  roles: Role[];
}

/**
 * Route permissions ordered from most-specific to least-specific.
 * The first matching prefix wins, so more restrictive routes must
 * come before the catch-all `/`.
 */
export const ROUTE_PERMISSIONS: RoutePermission[] = [
  { path: "/settings", roles: ["admin"] },
  { path: "/policies", roles: ["admin", "manager"] },
  { path: "/audit", roles: ["admin", "manager"] },
  { path: "/reports", roles: ["admin", "manager"] },
  { path: "/drift", roles: ["admin", "manager", "dev"] },
  { path: "/projects", roles: ["admin", "manager", "dev"] },
  { path: "/remediations/charts", roles: ["admin", "manager", "dev"] },
  { path: "/remediations", roles: ["admin", "manager"] },
  { path: "/approvals", roles: ["admin", "manager"] },
  { path: "/findings", roles: ["admin", "manager", "dev"] },
  { path: "/certificates", roles: ["admin", "manager", "dev", "viewer"] },
  { path: "/", roles: ["admin", "manager", "dev", "viewer"] },
];

/**
 * All navigation items shown in the sidebar.
 * `href` doubles as the route-permission key.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/", icon: "home" },
  { label: "Projects", href: "/projects", icon: "folder" },
  { label: "Findings", href: "/findings", icon: "search" },
  { label: "Approvals", href: "/approvals", icon: "check-circle" },
  { label: "Remediations", href: "/remediations", icon: "wrench" },
  { label: "Charts", href: "/remediations/charts", icon: "chart" },
  { label: "Certificates", href: "/certificates", icon: "shield" },
  { label: "Policies", href: "/policies", icon: "file-text" },
  { label: "Reports", href: "/reports", icon: "bar-chart" },
  { label: "Drift", href: "/drift", icon: "trending-up" },
  { label: "Audit Log", href: "/audit", icon: "clock" },
  { label: "Settings", href: "/settings", icon: "settings" },
];

/**
 * Check whether a user with `userRole` may access `path`.
 *
 * Matches the longest prefix in ROUTE_PERMISSIONS.
 * If no rule matches the path, access is denied by default.
 */
export function canAccess(userRole: Role, path: string): boolean {
  const normalised = path.replace(/\/+$/, "") || "/";

  for (const rule of ROUTE_PERMISSIONS) {
    if (rule.path === "/") {
      if (normalised === "/") return rule.roles.includes(userRole);
      continue;
    }
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
