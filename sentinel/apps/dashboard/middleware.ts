/**
 * Next.js middleware for SENTINEL dashboard authentication.
 *
 * Checks for a session cookie on protected /dashboard/* routes
 * and redirects unauthenticated users to /login.
 *
 * This is a simple cookie-presence check. In production this should
 * validate the session token (e.g. via next-auth's withAuth middleware).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Cookie name used by next-auth for session storage. */
const SESSION_COOKIE = "next-auth.session-token";
const SECURE_SESSION_COOKIE = "__Secure-next-auth.session-token";

/** Routes that require authentication. */
const PROTECTED_PREFIX = "/dashboard";

/** Routes that should never be intercepted. */
const PUBLIC_PATHS = ["/login", "/api/auth"];

/**
 * Determine whether a request path requires authentication.
 */
export function isProtectedPath(pathname: string): boolean {
  // Never protect public auth paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return false;
  }
  return pathname.startsWith(PROTECTED_PREFIX);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  // Check for session cookie (standard or secure variant)
  const hasSession =
    request.cookies.has(SESSION_COOKIE) ||
    request.cookies.has(SECURE_SESSION_COOKIE);

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
