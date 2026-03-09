/**
 * SENTINEL Dashboard — NextAuth.js configuration
 *
 * Supports GitHub and GitLab OAuth as identity providers.
 * Extends the default session with a `role` field sourced from
 * an env-var role map (MVP) or a database lookup (future).
 */

import type { AuthOptions, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GitHubProvider from "next-auth/providers/github";
import GitLabProvider from "next-auth/providers/gitlab";
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
 * Map usernames or emails → roles via the SENTINEL_ROLE_MAP env var.
 *
 * Format:  "admin:alice,bob;manager:carol;dev:dave"
 *
 * Falls back to "viewer" for unknown users.
 */
export function resolveRole(username: string | undefined | null): Role {
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

/**
 * Build the list of OAuth providers based on which env vars are set.
 * This allows zero-config: only providers with credentials are enabled.
 */
export function getConfiguredProviders(): any[] {
  const providers: any[] = [];

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push(
      GitHubProvider({
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      }),
    );
  }

  if (process.env.GITLAB_CLIENT_ID && process.env.GITLAB_CLIENT_SECRET) {
    providers.push(
      GitLabProvider({
        clientId: process.env.GITLAB_CLIENT_ID,
        clientSecret: process.env.GITLAB_CLIENT_SECRET,
        ...(process.env.GITLAB_URL
          ? {
              authorization: {
                url: `${process.env.GITLAB_URL}/oauth/authorize`,
              },
              token: { url: `${process.env.GITLAB_URL}/oauth/token` },
              userinfo: { url: `${process.env.GITLAB_URL}/api/v4/user` },
            }
          : {}),
      }),
    );
  }

  return providers;
}

export const authOptions: AuthOptions = {
  providers: getConfiguredProviders(),

  callbacks: {
    async jwt({ token, profile, account }) {
      if (profile) {
        // GitHub: profile.login, GitLab: profile.username
        const username =
          (profile as any).login ?? (profile as any).username;
        // Also try email for SAML/OIDC users
        const identifier = username ?? (profile as any).email;
        token.role = resolveRole(identifier);
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
