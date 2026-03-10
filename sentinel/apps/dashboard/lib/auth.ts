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
import { AuthRateLimiter, ProviderHealthMonitor } from "@sentinel/security";

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

  if (process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET && process.env.OIDC_ISSUER) {
    providers.push({
      id: "oidc",
      name: process.env.OIDC_PROVIDER_NAME ?? "SSO",
      type: "oauth",
      wellKnown: `${process.env.OIDC_ISSUER}/.well-known/openid-configuration`,
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
      authorization: { params: { scope: "openid email profile" } },
      idToken: true,
      profile(profile: any) {
        return {
          id: profile.sub,
          name: profile.name ?? profile.preferred_username,
          email: profile.email,
          image: profile.picture,
        };
      },
    } as any);
  }

  if (process.env.SAML_JACKSON_URL) {
    const jacksonUrl = process.env.SAML_JACKSON_URL;
    const product = process.env.SAML_JACKSON_PRODUCT ?? "sentinel";
    providers.push({
      id: "saml-jackson",
      name: "SAML SSO",
      type: "oauth",
      authorization: {
        url: `${jacksonUrl}/api/oauth/authorize`,
        params: { scope: "", response_type: "code", provider: "saml", product },
      },
      token: `${jacksonUrl}/api/oauth/token`,
      userinfo: `${jacksonUrl}/api/oauth/userinfo`,
      clientId: process.env.SAML_CLIENT_ID ?? "dummy",
      clientSecret: process.env.SAML_CLIENT_SECRET ?? "dummy",
      profile(profile: any) {
        return {
          id: profile.id ?? profile.email,
          name: profile.firstName ? `${profile.firstName} ${profile.lastName ?? ""}`.trim() : profile.email,
          email: profile.email,
          image: null,
        };
      },
    } as any);
  }

  return providers;
}

export const rateLimiter = new AuthRateLimiter();
export const providerHealth = new ProviderHealthMonitor();

// Prune expired rate limit entries every hour
if (typeof setInterval !== "undefined") {
  setInterval(() => rateLimiter.prune(), 60 * 60 * 1000);
}

// Request-scoped IP for use in NextAuth callbacks/events
let _currentRequestIp = "unknown";
export function setCurrentRequestIp(ip: string): void { _currentRequestIp = ip; }
export function getCurrentRequestIp(): string { return _currentRequestIp; }

/**
 * Extract client IP from request headers.
 * x-forwarded-for is set by reverse proxies; falls back to "unknown".
 */
export function extractClientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Extract provider ID from NextAuth catch-all route path.
 * e.g. /api/auth/callback/github → "github"
 */
export function extractProvider(url: string): string | undefined {
  try {
    const { pathname } = new URL(url);
    const parts = pathname.split("/");
    // /api/auth/<action>/<provider>
    if (parts.length >= 5 && (parts[3] === "callback" || parts[3] === "signin")) {
      return parts[4];
    }
  } catch { /* ignore malformed URLs */ }
  return undefined;
}

/** Structured auth event logger (JSON to stdout for log aggregators). */
export function logAuthEvent(event: string, details: Record<string, unknown>): void {
  const entry = { event, ...details, timestamp: new Date().toISOString() };
  console.log(JSON.stringify(entry));
}

export const authOptions: AuthOptions = {
  providers: getConfiguredProviders(),

  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,       // 8 hours absolute timeout
    updateAge: 60 * 60,         // Rotate JWT every 1 hour of activity
  },

  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },

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

  events: {
    async signIn({ account }) {
      const ip = getCurrentRequestIp();
      if (account?.provider) {
        providerHealth.recordSuccess(account.provider);
      }
      rateLimiter.reset(ip);
      logAuthEvent("auth.login.success", {
        provider: account?.provider,
        ip,
      });
    },
  },

  pages: {
    signIn: "/login",
  },

  secret: process.env.NEXTAUTH_SECRET,
};
