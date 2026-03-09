/**
 * SENTINEL Dashboard — NextAuth.js configuration
 *
 * Uses GitHub OAuth as the identity provider.
 * Extends the default session with a `role` field sourced from
 * an env-var role map (MVP) or a database lookup (future).
 */

import type { AuthOptions, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GitHubProvider from "next-auth/providers/github";
import type { Role } from "./rbac";

/**
 * Extend the default NextAuth types so `session.user.role` is
 * available throughout the app.
 */
declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: Role;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
  }
}

/**
 * Map GitHub usernames → roles via the SENTINEL_ROLE_MAP env var.
 *
 * Format:  "admin:alice,bob;manager:carol;dev:dave"
 *
 * Falls back to "viewer" for unknown users.
 */
function resolveRole(username: string | undefined | null): Role {
  if (!username) return "viewer";

  const raw = process.env.SENTINEL_ROLE_MAP ?? "";
  for (const segment of raw.split(";")) {
    const [role, users] = segment.split(":");
    if (role && users) {
      const list = users.split(",").map((u) => u.trim().toLowerCase());
      if (list.includes(username.toLowerCase())) {
        return role.trim() as Role;
      }
    }
  }

  return "viewer";
}

export const authOptions: AuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    }),
  ],

  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        // GitHub profile includes `login` (the username)
        const ghUsername = (profile as Record<string, unknown>).login as
          | string
          | undefined;
        token.role = resolveRole(ghUsername);
      }
      return token;
    },

    async session({ session, token }: { session: Session; token: JWT }) {
      session.user.role = (token.role as Role) ?? "viewer";
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },

  secret: process.env.NEXTAUTH_SECRET,
};
