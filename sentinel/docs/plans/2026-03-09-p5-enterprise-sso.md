# Enterprise SSO Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add GitLab OAuth and generic SAML/OIDC providers to the dashboard alongside the existing GitHub OAuth, with a unified login page showing all configured providers.

**Architecture:** Extend NextAuth.js config with GitLab OAuth provider, a generic OIDC provider, and SAML support. Each provider is enabled/disabled via env vars. The login page dynamically shows buttons for configured providers. Role mapping works across all providers via the existing SENTINEL_ROLE_MAP mechanism (keyed by email for SAML/OIDC, username for GitHub/GitLab).

**Tech Stack:** NextAuth.js 4.x, next-auth/providers, @boxyhq/saml-jackson (SAML), TypeScript

---

### Task 1: Add GitLab OAuth Provider

**Files:**
- Modify: `apps/dashboard/lib/auth.ts` (add GitLab provider)
- Modify: `apps/dashboard/app/(auth)/login/page.tsx` (add GitLab button)
- Modify: `.env.example` (add GitLab env vars)
- Test: `apps/dashboard/__tests__/auth.test.ts`

**Step 1: Write the failing test**

Create `apps/dashboard/__tests__/auth.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { resolveRole, getConfiguredProviders } from "../lib/auth";

describe("auth", () => {
  test("resolveRole returns viewer for unknown user", () => {
    expect(resolveRole(undefined)).toBe("viewer");
    expect(resolveRole("unknown-user")).toBe("viewer");
  });

  test("resolveRole maps by username from SENTINEL_ROLE_MAP", () => {
    process.env.SENTINEL_ROLE_MAP = "admin:alice;manager:bob";
    expect(resolveRole("alice")).toBe("admin");
    expect(resolveRole("bob")).toBe("manager");
    delete process.env.SENTINEL_ROLE_MAP;
  });

  test("resolveRole maps by email for SAML/OIDC users", () => {
    process.env.SENTINEL_ROLE_MAP = "admin:alice@example.com;manager:bob@corp.com";
    expect(resolveRole("alice@example.com")).toBe("admin");
    delete process.env.SENTINEL_ROLE_MAP;
  });

  test("getConfiguredProviders returns only providers with credentials", () => {
    // Clear all provider env vars
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITLAB_CLIENT_ID;
    delete process.env.OIDC_CLIENT_ID;
    delete process.env.SAML_JACKSON_URL;
    const providers = getConfiguredProviders();
    expect(providers).toEqual([]);
  });

  test("getConfiguredProviders includes GitHub when configured", () => {
    process.env.GITHUB_CLIENT_ID = "test";
    process.env.GITHUB_CLIENT_SECRET = "test";
    const providers = getConfiguredProviders();
    expect(providers).toContainEqual(expect.objectContaining({ id: "github" }));
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run __tests__/auth.test.ts`
Expected: FAIL

**Step 3: Refactor auth.ts to support multiple providers**

Update `apps/dashboard/lib/auth.ts`:
- Export `resolveRole` function (currently private)
- Add `getConfiguredProviders()` function that returns only providers with valid credentials
- Add GitLab provider: `GitLabProvider({ clientId, clientSecret })`
- Both GitHub and GitLab extract username via `profile.login` / `profile.username`
- Role resolution works with both usernames and emails

```typescript
import GitHubProvider from "next-auth/providers/github";
import GitLabProvider from "next-auth/providers/gitlab";

export function getConfiguredProviders() {
  const providers = [];

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push(GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }));
  }

  if (process.env.GITLAB_CLIENT_ID && process.env.GITLAB_CLIENT_SECRET) {
    providers.push(GitLabProvider({
      clientId: process.env.GITLAB_CLIENT_ID,
      clientSecret: process.env.GITLAB_CLIENT_SECRET,
    }));
  }

  return providers;
}
```

**Step 4: Update login page to show configured providers dynamically**

The login page should show buttons for all configured providers. Since this is a client component, pass available provider IDs via a server-side prop or API route.

**Step 5: Add env vars to .env.example**

```
# GitLab OAuth (optional)
GITLAB_CLIENT_ID=
GITLAB_CLIENT_SECRET=
GITLAB_URL=https://gitlab.com
```

**Step 6: Run tests**

Run: `cd apps/dashboard && npx vitest run`
Expected: All PASS

**Step 7: Commit**

```bash
git add apps/dashboard/lib/auth.ts apps/dashboard/app/(auth)/login/page.tsx apps/dashboard/__tests__/auth.test.ts .env.example
git commit -m "feat: add GitLab OAuth provider with dynamic login page"
```

---

### Task 2: Add Generic OIDC Provider

**Files:**
- Modify: `apps/dashboard/lib/auth.ts` (add OIDC provider)
- Modify: `apps/dashboard/app/(auth)/login/page.tsx` (add OIDC button)
- Modify: `.env.example` (add OIDC env vars)
- Test: `apps/dashboard/__tests__/auth.test.ts` (add OIDC tests)

**Step 1: Add OIDC test**

```typescript
test("getConfiguredProviders includes OIDC when configured", () => {
  process.env.OIDC_CLIENT_ID = "test";
  process.env.OIDC_CLIENT_SECRET = "test";
  process.env.OIDC_ISSUER = "https://idp.example.com";
  const providers = getConfiguredProviders();
  expect(providers).toContainEqual(expect.objectContaining({ id: "oidc" }));
  delete process.env.OIDC_CLIENT_ID;
  delete process.env.OIDC_CLIENT_SECRET;
  delete process.env.OIDC_ISSUER;
});
```

**Step 2: Add OIDC provider to auth.ts**

```typescript
// In getConfiguredProviders():
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
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name ?? profile.preferred_username,
        email: profile.email,
        image: profile.picture,
      };
    },
  });
}
```

**Step 3: Add env vars**

```
# Generic OIDC (optional — Okta, Auth0, Azure AD, Keycloak, etc.)
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_ISSUER=
OIDC_PROVIDER_NAME=SSO
```

**Step 4: Run tests and commit**

```bash
git add apps/dashboard/lib/auth.ts apps/dashboard/__tests__/auth.test.ts .env.example apps/dashboard/app/(auth)/login/page.tsx
git commit -m "feat: add generic OIDC provider for enterprise SSO"
```

---

### Task 3: Add SAML Support via BoxyHQ SAML Jackson

**Files:**
- Modify: `apps/dashboard/package.json` (add @boxyhq/saml-jackson dependency)
- Modify: `apps/dashboard/lib/auth.ts` (add SAML provider)
- Modify: `apps/dashboard/app/(auth)/login/page.tsx` (add SAML button)
- Modify: `.env.example` (add SAML env vars)
- Test: `apps/dashboard/__tests__/auth.test.ts`

**Step 1: Install dependency**

Run: `cd apps/dashboard && pnpm add @boxyhq/saml-jackson`

**Step 2: Add SAML test**

```typescript
test("getConfiguredProviders includes SAML when jackson URL configured", () => {
  process.env.SAML_JACKSON_URL = "https://jackson.example.com";
  process.env.SAML_JACKSON_PRODUCT = "sentinel";
  const providers = getConfiguredProviders();
  expect(providers).toContainEqual(expect.objectContaining({ id: "saml-jackson" }));
  delete process.env.SAML_JACKSON_URL;
  delete process.env.SAML_JACKSON_PRODUCT;
});
```

**Step 3: Add SAML provider**

BoxyHQ SAML Jackson provides a standard OAuth2/OIDC interface around SAML. Add as a custom OAuth provider:

```typescript
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
  });
}
```

**Step 4: Add env vars**

```
# SAML SSO via BoxyHQ SAML Jackson (optional)
SAML_JACKSON_URL=
SAML_JACKSON_PRODUCT=sentinel
SAML_CLIENT_ID=dummy
SAML_CLIENT_SECRET=dummy
```

**Step 5: Run tests and commit**

```bash
git add apps/dashboard/package.json apps/dashboard/lib/auth.ts apps/dashboard/__tests__/auth.test.ts .env.example apps/dashboard/app/(auth)/login/page.tsx pnpm-lock.yaml
git commit -m "feat: add SAML SSO support via BoxyHQ SAML Jackson"
```

---

### Task 4: Create NextAuth API Route Handler

**Files:**
- Create: `apps/dashboard/app/api/auth/[...nextauth]/route.ts`
- Test: verify login flow works

**Step 1: Create the route handler**

The dashboard currently has no explicit NextAuth route handler. Create it:

```typescript
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

**Step 2: Run tests and commit**

```bash
git add apps/dashboard/app/api/auth/
git commit -m "feat: add NextAuth API route handler for multi-provider auth"
```

---

### Task 5: Update Login Page with Dynamic Provider Buttons

**Files:**
- Create: `apps/dashboard/app/api/auth/providers/route.ts` (API route returning configured providers)
- Modify: `apps/dashboard/app/(auth)/login/page.tsx` (dynamic provider buttons)

**Step 1: Create providers API route**

```typescript
import { NextResponse } from "next/server";
import { getConfiguredProviders } from "@/lib/auth";

export async function GET() {
  const providers = getConfiguredProviders();
  return NextResponse.json(
    providers.map((p: any) => ({ id: p.id, name: p.name ?? p.id }))
  );
}
```

**Step 2: Update login page**

Replace the single GitHub button with a dynamic list fetched from `/api/auth/providers`. Show an icon + label for each. GitHub gets GitHub icon, GitLab gets GitLab icon, OIDC/SAML get a key/lock icon.

**Step 3: Add GitLab icon to the icon set**

**Step 4: Run all dashboard tests**

Run: `cd apps/dashboard && npx vitest run`
Expected: All PASS

**Step 5: Commit**

```bash
git add apps/dashboard/
git commit -m "feat: dynamic login page with multi-provider SSO buttons"
```

---

### Task 6: Update Docker Compose and Deployment Config

**Files:**
- Modify: `docker-compose.sentinel.yml` (add SSO env vars to dashboard)
- Modify: `docker-compose.yml` (add SSO env vars)
- Modify: `deploy/k8s/secrets.yaml` (add SSO secrets)
- Modify: `deploy/helm/values.yaml` (add SSO values)

**Step 1: Add env vars to all deployment configs**

Dashboard service needs:
```yaml
GITLAB_CLIENT_ID: ${GITLAB_CLIENT_ID:-}
GITLAB_CLIENT_SECRET: ${GITLAB_CLIENT_SECRET:-}
GITLAB_URL: ${GITLAB_URL:-https://gitlab.com}
OIDC_CLIENT_ID: ${OIDC_CLIENT_ID:-}
OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET:-}
OIDC_ISSUER: ${OIDC_ISSUER:-}
OIDC_PROVIDER_NAME: ${OIDC_PROVIDER_NAME:-SSO}
SAML_JACKSON_URL: ${SAML_JACKSON_URL:-}
SAML_JACKSON_PRODUCT: ${SAML_JACKSON_PRODUCT:-sentinel}
SAML_CLIENT_ID: ${SAML_CLIENT_ID:-dummy}
SAML_CLIENT_SECRET: ${SAML_CLIENT_SECRET:-dummy}
```

**Step 2: Commit**

```bash
git add docker-compose.sentinel.yml docker-compose.yml deploy/
git commit -m "feat: add SSO env vars to all deployment configs"
```
