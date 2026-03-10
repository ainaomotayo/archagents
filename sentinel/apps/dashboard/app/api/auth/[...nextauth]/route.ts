import NextAuth from "next-auth";
import {
  authOptions,
  rateLimiter,
  providerHealth,
  extractClientIp,
  extractProvider,
  setCurrentRequestIp,
  logAuthEvent,
} from "@/lib/auth";

const nextAuth = NextAuth(authOptions);

export { nextAuth as GET };

/**
 * Wrapped POST handler that adds:
 * - Rate limiting (check before NextAuth, record on failure)
 * - Provider health failure tracking
 * - Auth event audit logging
 */
export async function POST(req: Request): Promise<Response> {
  const ip = extractClientIp(req.headers);
  const provider = extractProvider(req.url);

  // Check rate limiter before processing auth
  const limit = rateLimiter.check(ip);
  if (!limit.allowed) {
    logAuthEvent("auth.login.rate_limited", {
      ip,
      retryAfterMs: limit.retryAfterMs,
    });
    return new Response(
      JSON.stringify({ error: "Too many login attempts. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...(limit.retryAfterMs
            ? { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) }
            : {}),
        },
      },
    );
  }

  // Store IP for use in NextAuth events.signIn callback
  setCurrentRequestIp(ip);

  const response = await nextAuth(req);

  // Detect OAuth failures: NextAuth redirects to error page on failure
  const location = response.headers.get("location") ?? "";
  if (location.includes("error=")) {
    rateLimiter.record(ip);
    if (provider) {
      providerHealth.recordFailure(provider);
    }
    const errorMatch = location.match(/error=([^&]+)/);
    logAuthEvent("auth.login.failed", {
      ip,
      provider: provider ?? "unknown",
      error: errorMatch?.[1] ?? "unknown",
    });
  }

  return response;
}
