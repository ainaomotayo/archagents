import { describe, it, expect, vi } from "vitest";
import { EnvelopeEncryption } from "../envelope.js";
import { DekCache } from "../dek-cache.js";

function createMockKms() {
  return {
    name: "test",
    generateDataKey: vi.fn().mockResolvedValue({
      plaintext: Buffer.alloc(32, 0xaa),
      wrapped: Buffer.alloc(60, 0xbb),
    }),
    unwrapDataKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 0xaa)),
    rewrapDataKey: vi.fn(),
    ping: vi.fn().mockResolvedValue(true),
  };
}

describe("EnvelopeEncryption auto-provision", () => {
  it("uses keyLoader to load keys from external source", async () => {
    const kms = createMockKms();
    const cache = new DekCache();
    const envelope = new EnvelopeEncryption(kms, cache);

    envelope.setKeyLoader(async (_orgId, _purpose) => {
      return { wrappedDek: Buffer.alloc(60, 0xbb), kekId: "kek-1" };
    });

    const encrypted = await envelope.encrypt("org-1", "sso_secrets", "hello");
    expect(encrypted).toBeTruthy();
    expect(kms.unwrapDataKey).toHaveBeenCalledWith("kek-1", Buffer.alloc(60, 0xbb));
  });

  it("auto-provisions key when loader returns null and provisioner is set", async () => {
    const kms = createMockKms();
    const cache = new DekCache();
    const envelope = new EnvelopeEncryption(kms, cache);

    let storedKey: any = null;
    envelope.setKeyLoader(async () => null);
    envelope.setKeyProvisioner(async (orgId, purpose, wrappedDek, kekId) => {
      storedKey = { orgId, purpose, wrappedDek: wrappedDek.toString("hex"), kekId };
    });

    const encrypted = await envelope.encrypt("org-new", "sso_secrets", "secret");
    expect(encrypted).toBeTruthy();
    expect(storedKey).not.toBeNull();
    expect(storedKey.orgId).toBe("org-new");
    expect(storedKey.purpose).toBe("sso_secrets");
    expect(kms.generateDataKey).toHaveBeenCalledWith("default");
  });

  it("throws when no loader, no provisioner, and no key record", async () => {
    const kms = createMockKms();
    const cache = new DekCache();
    const envelope = new EnvelopeEncryption(kms, cache);

    await expect(envelope.encrypt("missing-org", "test", "data"))
      .rejects.toThrow("No encryption key for missing-org:test");
  });

  it("setDefaultKekId changes the kekId used for auto-provisioning", async () => {
    const kms = createMockKms();
    const cache = new DekCache();
    const envelope = new EnvelopeEncryption(kms, cache);

    envelope.setKeyLoader(async () => null);
    envelope.setKeyProvisioner(async () => {});
    envelope.setDefaultKekId("custom-kek");

    await envelope.encrypt("org-x", "purpose", "data");
    expect(kms.generateDataKey).toHaveBeenCalledWith("custom-kek");
  });
});
