import { describe, it, expect } from "vitest";
import { AwsKmsKeyStore } from "../kms-aws.js";

describe("AwsKmsKeyStore", () => {
  it("implements KmsKeyStore interface", () => {
    const store = new AwsKmsKeyStore({ masterKeyId: "test-key" });
    expect(store.getKey).toBeDefined();
    expect(store.storeKey).toBeDefined();
    expect(store.destroyKey).toBeDefined();
  });

  it("cache returns null for unknown org", async () => {
    const store = new AwsKmsKeyStore({ masterKeyId: "test-key" });
    expect(await store.getKey("unknown")).toBeNull();
  });

  it("cache stores and retrieves keys", async () => {
    const store = new AwsKmsKeyStore({ masterKeyId: "test-key" });
    const key = Buffer.from("test-key-data");
    await store.storeKey("org-1", key);
    expect(await store.getKey("org-1")).toEqual(key);
  });

  it("destroyKey removes from cache", async () => {
    const store = new AwsKmsKeyStore({ masterKeyId: "test-key" });
    await store.storeKey("org-1", Buffer.from("key"));
    await store.destroyKey("org-1");
    expect(await store.getKey("org-1")).toBeNull();
  });
});
