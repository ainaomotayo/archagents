import { describe, it, expect } from "vitest";
import { generateEncryptionKey, encrypt, decrypt, InMemoryKeyStore } from "./kms.js";

describe("kms", () => {
  it("should generate a 256-bit (32-byte) key", () => {
    const key = generateEncryptionKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it("should generate unique keys each time", () => {
    const k1 = generateEncryptionKey();
    const k2 = generateEncryptionKey();
    expect(k1.equals(k2)).toBe(false);
  });

  it("should encrypt and decrypt data correctly", () => {
    const key = generateEncryptionKey();
    const plaintext = "sensitive org data: credit card 4111-1111-1111-1111";
    const ciphertext = encrypt(plaintext, key);
    expect(ciphertext).not.toBe(plaintext);
    const decrypted = decrypt(ciphertext, key);
    expect(decrypted).toBe(plaintext);
  });

  it("should produce different ciphertexts for same plaintext (random IV)", () => {
    const key = generateEncryptionKey();
    const plaintext = "same data";
    const c1 = encrypt(plaintext, key);
    const c2 = encrypt(plaintext, key);
    expect(c1).not.toBe(c2);
  });

  it("should fail to decrypt with wrong key", () => {
    const key1 = generateEncryptionKey();
    const key2 = generateEncryptionKey();
    const ciphertext = encrypt("secret", key1);
    expect(() => decrypt(ciphertext, key2)).toThrow();
  });

  it("should handle empty string encryption", () => {
    const key = generateEncryptionKey();
    const ciphertext = encrypt("", key);
    const decrypted = decrypt(ciphertext, key);
    expect(decrypted).toBe("");
  });

  describe("InMemoryKeyStore", () => {
    it("should store and retrieve a key", async () => {
      const store = new InMemoryKeyStore();
      const key = generateEncryptionKey();
      await store.storeKey("org-1", key);
      const retrieved = await store.getKey("org-1");
      expect(retrieved).not.toBeNull();
      expect(retrieved!.equals(key)).toBe(true);
    });

    it("should return null for unknown org", async () => {
      const store = new InMemoryKeyStore();
      const result = await store.getKey("unknown-org");
      expect(result).toBeNull();
    });

    it("should destroy a key making it unretrievable", async () => {
      const store = new InMemoryKeyStore();
      const key = generateEncryptionKey();
      await store.storeKey("org-1", key);
      await store.destroyKey("org-1");
      const result = await store.getKey("org-1");
      expect(result).toBeNull();
    });
  });
});
