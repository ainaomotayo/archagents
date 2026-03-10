import type { Redis } from "ioredis";

export const RATE_LIMIT_MAX = 4500; // Leave 500 buffer from GitHub's 5000/hr
const WINDOW_SECONDS = 3600;

function rateLimitKey(installationId: number): string {
  return `github:ratelimit:${installationId}`;
}

export async function checkRateLimit(
  redis: Redis,
  installationId: number,
): Promise<boolean> {
  const key = rateLimitKey(installationId);
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }
  return current <= RATE_LIMIT_MAX;
}
