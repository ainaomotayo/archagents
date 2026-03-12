import type { Redis } from "ioredis";
import type { VcsProviderType } from "./types.js";

const WINDOW_SECONDS = 3600;

const LIMITS: Record<VcsProviderType, number> = {
  github: 4500, // 5000/hr with 500 buffer
  gitlab: 600, // gitlab.com ~10/sec conservative hourly
  bitbucket: 1000, // Bitbucket Cloud 1000/hr
  azure_devops: 2000, // Azure DevOps varies, conservative
};

export class VcsRateLimiter {
  constructor(private redis: Redis) {}

  async check(
    provider: VcsProviderType,
    installationId: string,
  ): Promise<boolean> {
    const key = `vcs:ratelimit:${provider}:${installationId}`;
    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, WINDOW_SECONDS);
    }
    return current <= (LIMITS[provider] ?? 1000);
  }
}
