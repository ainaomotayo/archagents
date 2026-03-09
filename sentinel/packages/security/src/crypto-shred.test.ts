import { describe, it, expect } from "vitest";
import { purgeOrganization } from "./crypto-shred.js";
import { InMemoryKeyStore, generateEncryptionKey, encrypt, decrypt } from "./kms.js";

describe("crypto-shred", () => {
  it("should purge an organization and destroy its key", async () => {
    const store = new InMemoryKeyStore();
    const key = generateEncryptionKey();
    await store.storeKey("org-1", key);

    const result = await purgeOrganization("org-1", store);

    expect(result.orgId).toBe("org-1");
    expect(result.keysDestroyed).toBe(1);
    expect(result.dataRecordsInvalidated).toBe(1);
    expect(result.timestamp).toBeTruthy();

    // Key should be gone
    const retrieved = await store.getKey("org-1");
    expect(retrieved).toBeNull();
  });

  it("should make encrypted data unrecoverable after purge", async () => {
    const store = new InMemoryKeyStore();
    const key = generateEncryptionKey();
    await store.storeKey("org-1", key);

    const ciphertext = encrypt("secret data", key);

    await purgeOrganization("org-1", store);

    // Key is gone from the store, so no way to decrypt
    const retrievedKey = await store.getKey("org-1");
    expect(retrievedKey).toBeNull();

    // Attempting to decrypt with a different key should fail
    const wrongKey = generateEncryptionKey();
    expect(() => decrypt(ciphertext, wrongKey)).toThrow();
  });

  it("should be idempotent — purging twice is safe", async () => {
    const store = new InMemoryKeyStore();
    const key = generateEncryptionKey();
    await store.storeKey("org-1", key);

    const first = await purgeOrganization("org-1", store);
    expect(first.keysDestroyed).toBe(1);

    const second = await purgeOrganization("org-1", store);
    expect(second.keysDestroyed).toBe(0);
    expect(second.dataRecordsInvalidated).toBe(0);
  });

  it("should handle purge of org with no key", async () => {
    const store = new InMemoryKeyStore();
    const result = await purgeOrganization("nonexistent-org", store);
    expect(result.keysDestroyed).toBe(0);
    expect(result.dataRecordsInvalidated).toBe(0);
  });
});
