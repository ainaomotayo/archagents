import type { Redis } from "ioredis";
import type { VcsProviderType } from "./types.js";

const WINDOW_SECONDS = 3600;

const DEFAULT_LIMITS: Record<VcsProviderType, number> = {
  github: 4500, // 5000/hr with 500 buffer
  gitlab: 600, // gitlab.com ~10/sec conservative hourly
  bitbucket: 1000, // Bitbucket Cloud 1000/hr
  azure_devops: 2000, // Azure DevOps varies, conservative
};

// Lua script for atomic increment + expire (fixes INCR/EXPIRE race)
const INCR_WITH_EXPIRE = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

export interface RateLimiterOptions {
  limits?: Partial<Record<VcsProviderType, number>>;
}

export class VcsRateLimiter {
  private limits: Record<VcsProviderType, number>;

  constructor(private redis: Redis, opts?: RateLimiterOptions) {
    this.limits = { ...DEFAULT_LIMITS, ...opts?.limits };
  }

  async check(
    provider: VcsProviderType,
    installationId: string,
  ): Promise<boolean> {
    const key = `vcs:ratelimit:${provider}:${installationId}`;
    const current = await this.redis.eval(
      INCR_WITH_EXPIRE,
      1,
      key,
      WINDOW_SECONDS,
    ) as number;
    return current <= (this.limits[provider] ?? 1000);
  }
}
