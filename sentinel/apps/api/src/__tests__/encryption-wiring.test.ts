import { describe, it, expect, vi } from "vitest";
import { DekCache, EnvelopeEncryption, LocalKmsProvider } from "@sentinel/security";
import { initEncryption } from "@sentinel/db";

describe("Encryption wiring", () => {
  it("constructs EnvelopeEncryption with LocalKmsProvider and DekCache", () => {
    const cache = new DekCache();
    const kms = new LocalKmsProvider("test-secret");
    const envelope = new EnvelopeEncryption(kms, cache);

    expect(envelope).toBeInstanceOf(EnvelopeEncryption);
    expect(kms.name).toBe("local");
    expect(cache.size).toBe(0);
  });

  it("initEncryption is callable and accepts an EnvelopeEncryption instance", () => {
    // initEncryption should be a function
    expect(typeof initEncryption).toBe("function");

    // Calling it should not throw when given a valid envelope
    const cache = new DekCache();
    const kms = new LocalKmsProvider("test-secret");
    const envelope = new EnvelopeEncryption(kms, cache);

    expect(() => initEncryption(envelope)).not.toThrow();
  });

  it("key loader receives orgId and purpose and returns loaded key", async () => {
    const cache = new DekCache();
    const kms = new LocalKmsProvider("test-secret");
    const envelope = new EnvelopeEncryption(kms, cache);

    // Generate a wrapped key to simulate a DB record
    const { wrapped } = await kms.generateDataKey("default");
    const kekId = "default";

    // Wire a mock key loader that returns the wrapped key
    const loader = vi.fn().mockResolvedValue({ wrappedDek: wrapped, kekId });
    envelope.setKeyLoader(loader);

    // Encrypt should trigger the key loader for an unknown org+purpose
    const ciphertext = await envelope.encrypt("org-1", "data", "hello world");
    expect(loader).toHaveBeenCalledWith("org-1", "data");
    expect(typeof ciphertext).toBe("string");

    // Decrypt should succeed
    const plaintext = await envelope.decrypt("org-1", "data", ciphertext);
    expect(plaintext).toBe("hello world");
  });

  it("key provisioner is called when no key exists and no loader returns a key", async () => {
    const cache = new DekCache();
    const kms = new LocalKmsProvider("test-secret");
    const envelope = new EnvelopeEncryption(kms, cache);

    // Loader returns null (no existing key)
    envelope.setKeyLoader(vi.fn().mockResolvedValue(null));

    // Provisioner captures the newly generated wrapped DEK
    const provisioned: { orgId: string; purpose: string; wrappedDek: Buffer; kekId: string }[] = [];
    envelope.setKeyProvisioner(async (orgId, purpose, wrappedDek, kekId) => {
      provisioned.push({ orgId, purpose, wrappedDek, kekId });
    });

    envelope.setDefaultKekId("default");

    // Encrypt should trigger auto-provisioning
    const ciphertext = await envelope.encrypt("org-2", "webhook", "secret payload");
    expect(provisioned).toHaveLength(1);
    expect(provisioned[0].orgId).toBe("org-2");
    expect(provisioned[0].purpose).toBe("webhook");
    expect(provisioned[0].kekId).toBe("default");
    expect(provisioned[0].wrappedDek).toBeInstanceOf(Buffer);

    // Decrypt should work because the key was cached during provisioning
    const plaintext = await envelope.decrypt("org-2", "webhook", ciphertext);
    expect(plaintext).toBe("secret payload");
  });

  it("DekCache evicts keys for a specific org", async () => {
    const cache = new DekCache();
    const kms = new LocalKmsProvider("test-secret");
    const envelope = new EnvelopeEncryption(kms, cache);

    // Generate and cache a key
    await envelope.generateOrgKey("org-3", "data", "default");
    expect(cache.size).toBe(1);

    // Evict
    cache.evict("org-3");
    expect(cache.size).toBe(0);
  });
});
