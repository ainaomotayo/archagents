/**
 * Shared E2E test helpers.
 *
 * The session token is a valid JWE encrypted with NEXTAUTH_SECRET=e2e-test-secret
 * (set in playwright.config.ts). It contains a minimal JWT payload so NextAuth
 * can decode it without errors, preventing cookie-clearing on invalid sessions.
 */

/**
 * Valid JWE session token for E2E tests.
 * Payload: { sub: "test-user", name: "Test User", email: "test@example.com", role: "admin", iat: 1700000000, exp: 4102444800 }
 * Encrypted with secret "e2e-test-secret" using AES-256-GCM.
 */
export const E2E_SESSION_TOKEN =
  "AAAAAAAAAAAAAAAA8YWdQjLds7-86-nZlo14OURghui_XkBs8hZ-pzBF_Ng_7BTh6ZuHNJJxLpQXcVYRDwHCINhZ5jLk5JmhEnuApvUfSBPi4r_fp07ogNz5eZEZdvkWoTfLIawttXM0ahDu-2LGw4J6s9ZJAwyn0yOrGpL2U9O5svly6xg6wJZmhH1w8A";

export const SESSION_COOKIE = {
  name: "next-auth.session-token",
  value: E2E_SESSION_TOKEN,
  domain: "localhost",
  path: "/",
} as const;
