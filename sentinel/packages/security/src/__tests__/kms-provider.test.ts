import { describe, it, expect } from "vitest";
import { LocalKmsProvider } from "../kms-local.js";
import { DekCache } from "../dek-cache.js";

describe("LocalKmsProvider", () => {
  it("generateDataKey returns plaintext and wrapped DEK", async () => {
    const provider = new LocalKmsProvider();
    const { plaintext, wrapped } = await provider.generateDataKey("test-kek-1");
    expect(plaintext).toBeInstanceOf(Buffer);
    expect(wrapped).toBeInstanceOf(Buffer);
    expect(plaintext.length).toBe(32); // 256-bit key
    expect(wrapped.length).toBeGreaterThan(32); // wrapped is larger
  });

  it("unwrapDataKey recovers original plaintext", async () => {
    const provider = new LocalKmsProvider();
    const { plaintext, wrapped } = await provider.generateDataKey("test-kek-1");
    const recovered = await provider.unwrapDataKey("test-kek-1", wrapped);
    expect(recovered).toEqual(plaintext);
  });

  it("unwrapDataKey fails with wrong kekId", async () => {
    const provider = new LocalKmsProvider();
    const { wrapped } = await provider.generateDataKey("test-kek-1");
    await expect(provider.unwrapDataKey("wrong-kek", wrapped)).rejects.toThrow();
  });

  it("rewrapDataKey produces new wrapped blob decodable with same kekId", async () => {
    const provider = new LocalKmsProvider();
    const { plaintext, wrapped } = await provider.generateDataKey("test-kek-1");
    const rewrapped = await provider.rewrapDataKey("test-kek-1", wrapped);
    expect(rewrapped).not.toEqual(wrapped); // Different IV
    const recovered = await provider.unwrapDataKey("test-kek-1", rewrapped);
    expect(recovered).toEqual(plaintext);
  });

  it("ping returns true", async () => {
    const provider = new LocalKmsProvider();
    expect(await provider.ping()).toBe(true);
  });

  it("unwrapDataKey fails with tampered wrapped data", async () => {
    const provider = new LocalKmsProvider();
    const { wrapped } = await provider.generateDataKey("test-kek-1");
    // Flip a byte in the ciphertext portion (after IV + authTag)
    wrapped[30] ^= 0xff;
    await expect(provider.unwrapDataKey("test-kek-1", wrapped)).rejects.toThrow();
  });
});

describe("DekCache", () => {
  it("returns null on cache miss", () => {
    const cache = new DekCache({ maxSize: 10, ttlMs: 5000 });
    expect(cache.get("org1", "data")).toBeNull();
  });

  it("stores and retrieves DEK", () => {
    const cache = new DekCache({ maxSize: 10, ttlMs: 5000 });
    const key = Buffer.from("a".repeat(32));
    cache.set("org1", "data", key);
    expect(cache.get("org1", "data")).toEqual(key);
  });

  it("returns null after TTL expiry", async () => {
    const cache = new DekCache({ maxSize: 10, ttlMs: 50 });
    cache.set("org1", "data", Buffer.from("a".repeat(32)));
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get("org1", "data")).toBeNull();
  });

  it("evict clears all entries for org", () => {
    const cache = new DekCache({ maxSize: 10, ttlMs: 5000 });
    cache.set("org1", "data", Buffer.from("a".repeat(32)));
    cache.set("org1", "webhook", Buffer.from("b".repeat(32)));
    cache.set("org2", "data", Buffer.from("c".repeat(32)));
    cache.evict("org1");
    expect(cache.get("org1", "data")).toBeNull();
    expect(cache.get("org1", "webhook")).toBeNull();
    expect(cache.get("org2", "data")).not.toBeNull();
  });

  it("evicts LRU entry when maxSize reached", () => {
    const cache = new DekCache({ maxSize: 2, ttlMs: 5000 });
    cache.set("org1", "a", Buffer.from("1".repeat(32)));
    cache.set("org2", "b", Buffer.from("2".repeat(32)));
    cache.set("org3", "c", Buffer.from("3".repeat(32))); // evicts org1:a
    expect(cache.get("org1", "a")).toBeNull();
    expect(cache.get("org2", "b")).not.toBeNull();
  });

  it("size returns current cache size", () => {
    const cache = new DekCache({ maxSize: 10, ttlMs: 5000 });
    expect(cache.size).toBe(0);
    cache.set("org1", "a", Buffer.from("1".repeat(32)));
    expect(cache.size).toBe(1);
  });
});
