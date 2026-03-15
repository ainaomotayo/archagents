export interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  lockoutMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

const LOOPBACK = new Set(["127.0.0.1", "::1"]);

const DEFAULT_CONFIG: RateLimitConfig = {
  maxAttempts: 10,
  windowMs: 60_000,
  lockoutMs: 300_000,
};

export class AuthRateLimiter {
  private attempts = new Map<string, number[]>();
  private lockouts = new Map<string, number>();
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  check(ip: string): RateLimitResult {
    if (LOOPBACK.has(ip)) {
      return { allowed: true, remaining: this.config.maxAttempts };
    }

    const lockoutExpiry = this.lockouts.get(ip);
    if (lockoutExpiry !== undefined) {
      const now = Date.now();
      if (now < lockoutExpiry) {
        return { allowed: false, remaining: 0, retryAfterMs: lockoutExpiry - now };
      }
      this.lockouts.delete(ip);
      this.attempts.delete(ip);
    }

    const now = Date.now();
    const cutoff = now - this.config.windowMs;
    const timestamps = (this.attempts.get(ip) ?? []).filter((t) => t > cutoff);
    this.attempts.set(ip, timestamps);

    const remaining = Math.max(0, this.config.maxAttempts - timestamps.length);
    return { allowed: remaining > 0, remaining };
  }

  record(ip: string): void {
    if (LOOPBACK.has(ip)) return;

    const now = Date.now();
    const cutoff = now - this.config.windowMs;
    const timestamps = (this.attempts.get(ip) ?? []).filter((t) => t > cutoff);
    timestamps.push(now);
    this.attempts.set(ip, timestamps);

    if (timestamps.length >= this.config.maxAttempts) {
      this.lockouts.set(ip, now + this.config.lockoutMs);
    }
  }

  reset(ip: string): void {
    this.attempts.delete(ip);
    this.lockouts.delete(ip);
  }

  prune(): void {
    const now = Date.now();
    for (const [ip, expiry] of this.lockouts) {
      if (now >= expiry) this.lockouts.delete(ip);
    }
    const cutoff = now - this.config.windowMs;
    for (const [ip, timestamps] of this.attempts) {
      const active = timestamps.filter((t) => t > cutoff);
      if (active.length === 0) this.attempts.delete(ip);
      else this.attempts.set(ip, active);
    }
  }
}
