type MembershipLookup = (userId: string, orgId: string) => Promise<{ role: string; source: string } | null>;

export async function resolveRoleFromDb(
  userId: string,
  orgId: string,
  lookup: MembershipLookup,
  roleMapEnv?: string,
  username?: string,
): Promise<string> {
  // Priority 1: DB membership
  const membership = await lookup(userId, orgId);
  if (membership) return membership.role;

  // Priority 2: Env-var mapping (SENTINEL_ROLE_MAP format: "admin:alice,bob;manager:carol")
  if (roleMapEnv && username) {
    const normalizedUsername = username.toLowerCase();
    const pairs = roleMapEnv.split(";");
    for (const pair of pairs) {
      const [role, ...users] = pair.split(":");
      const userList = users.join(":").split(",").map((u) => u.trim().toLowerCase());
      if (userList.includes(normalizedUsername)) return role.trim();
    }
  }

  // Priority 3: Default
  return "viewer";
}
