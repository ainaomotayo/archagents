import { describe, it, expect } from "vitest";
import { GcpKmsKeyStore } from "../kms-gcp.js";

describe("GcpKmsKeyStore", () => {
  const store = new GcpKmsKeyStore({
    projectId: "test-project",
    locationId: "global",
    keyRingId: "test-ring",
    keyId: "test-key",
  });

  it("implements KmsKeyStore interface", () => {
    expect(store.getKey).toBeDefined();
    expect(store.storeKey).toBeDefined();
    expect(store.destroyKey).toBeDefined();
  });

  it("cache returns null for unknown org", async () => {
    expect(await store.getKey("unknown")).toBeNull();
  });

  it("cache stores and retrieves keys", async () => {
    const key = Buffer.from("test");
    await store.storeKey("org-1", key);
    expect(await store.getKey("org-1")).toEqual(key);
  });

  it("destroyKey removes from cache", async () => {
    await store.storeKey("org-2", Buffer.from("k"));
    await store.destroyKey("org-2");
    expect(await store.getKey("org-2")).toBeNull();
  });
});
