import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, verifyApiKey, extractPrefix } from "../api-keys.js";

describe("API Key Management", () => {
  it("generateApiKey returns key starting with sk_", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^sk_[A-Za-z0-9_-]{32,}$/);
  });

  it("generateApiKey produces unique keys", () => {
    const k1 = generateApiKey();
    const k2 = generateApiKey();
    expect(k1).not.toBe(k2);
  });

  it("extractPrefix returns first 8 characters", () => {
    expect(extractPrefix("sk_abc12345xyz")).toBe("sk_abc12");
  });

  it("hashApiKey returns hash and salt", async () => {
    const { hash, salt } = await hashApiKey("sk_test123");
    expect(hash).toBeTruthy();
    expect(salt).toBeTruthy();
    expect(typeof hash).toBe("string");
    expect(typeof salt).toBe("string");
  });

  it("verifyApiKey returns true for correct key", async () => {
    const key = generateApiKey();
    const { hash, salt } = await hashApiKey(key);
    const valid = await verifyApiKey(key, hash, salt);
    expect(valid).toBe(true);
  });

  it("verifyApiKey returns false for wrong key", async () => {
    const { hash, salt } = await hashApiKey("sk_correct");
    const valid = await verifyApiKey("sk_wrong", hash, salt);
    expect(valid).toBe(false);
  });
});
