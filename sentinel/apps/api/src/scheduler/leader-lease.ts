import type { Redis } from "ioredis";
import type { LeaderLease } from "./types.js";

export interface LeaderLeaseOptions {
  key: string;
  ttlMs: number;
  instanceId: string;
}

const RENEW_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export class RedisLeaderLease implements LeaderLease {
  private _isLeader = false;
  private readonly key: string;
  private readonly ttlMs: number;
  private readonly instanceId: string;

  constructor(private redis: Redis, options: LeaderLeaseOptions) {
    this.key = options.key;
    this.ttlMs = options.ttlMs;
    this.instanceId = options.instanceId;
  }

  async acquire(): Promise<boolean> {
    const result = await this.redis.set(
      this.key,
      this.instanceId,
      "PX", this.ttlMs,
      "NX",
    );
    this._isLeader = result === "OK";
    return this._isLeader;
  }

  async renew(): Promise<boolean> {
    const result = await this.redis.eval(
      RENEW_SCRIPT,
      1,
      this.key,
      this.instanceId,
      String(this.ttlMs),
    );
    this._isLeader = result === 1;
    return this._isLeader;
  }

  async release(): Promise<void> {
    await this.redis.eval(
      RELEASE_SCRIPT,
      1,
      this.key,
      this.instanceId,
    );
    this._isLeader = false;
  }

  isLeader(): boolean {
    return this._isLeader;
  }
}
