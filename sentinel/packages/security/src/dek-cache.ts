interface DekCacheEntry {
  plaintext: Buffer;
  expiresAt: number;
  lastAccessed: number;
}

export interface DekCacheOptions {
  maxSize: number;
  ttlMs: number;
}

export class DekCache {
  private cache = new Map<string, DekCacheEntry>();
  private maxSize: number;
  private ttlMs: number;

  constructor(opts?: Partial<DekCacheOptions>) {
    this.maxSize = opts?.maxSize ?? 256;
    this.ttlMs = opts?.ttlMs ?? 5 * 60 * 1000; // 5 minutes
  }

  get size(): number {
    return this.cache.size;
  }

  private key(orgId: string, purpose: string): string {
    return `${orgId}\0${purpose}`;
  }

  get(orgId: string, purpose: string): Buffer | null {
    const k = this.key(orgId, purpose);
    const entry = this.cache.get(k);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.deleteEntry(k);
      return null;
    }
    entry.lastAccessed = Date.now();
    return entry.plaintext;
  }

  set(orgId: string, purpose: string, plaintext: Buffer): void {
    if (this.cache.size >= this.maxSize) {
      this.evictLru();
    }
    this.cache.set(this.key(orgId, purpose), {
      plaintext,
      expiresAt: Date.now() + this.ttlMs,
      lastAccessed: Date.now(),
    });
  }

  evict(orgId: string): void {
    const prefix = `${orgId}\0`;
    for (const k of this.cache.keys()) {
      if (k.startsWith(prefix)) {
        this.deleteEntry(k);
      }
    }
  }

  private deleteEntry(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      entry.plaintext.fill(0);
      this.cache.delete(key);
    }
  }

  private evictLru(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of this.cache) {
      if (v.lastAccessed < oldestTime) {
        oldestTime = v.lastAccessed;
        oldest = k;
      }
    }
    if (oldest) this.deleteEntry(oldest);
  }
}
