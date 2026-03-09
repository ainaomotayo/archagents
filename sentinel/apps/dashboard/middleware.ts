/**
 * Next.js middleware for SENTINEL dashboard authentication.
 *
 * Checks for a session cookie on protected routes and redirects
 * unauthenticated users to /login.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "next-auth.session-token";
const SECURE_SESSION_COOKIE = "__Secure-next-auth.session-token";

/** Routes that should never be intercepted (public). */
const PUBLIC_PATHS = ["/login", "/api/auth", "/welcome", "/pricing"];

export function isProtectedPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return false;
  }
  // Protect all non-public paths (dashboard pages are at root level)
  return true;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

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
  matcher: [
    "/",
    "/projects/:path*",
    "/findings/:path*",
    "/certificates/:path*",
    "/policies/:path*",
    "/reports/:path*",
    "/audit/:path*",
    "/drift/:path*",
    "/settings/:path*",
  ],
};
