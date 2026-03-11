import { describe, it, expect } from "vitest";
import { EnvelopeEncryption } from "../envelope.js";
import { LocalKmsProvider } from "../kms-local.js";
import { DekCache } from "../dek-cache.js";

function createService() {
  const kms = new LocalKmsProvider();
  const cache = new DekCache({ maxSize: 10, ttlMs: 5000 });
  return new EnvelopeEncryption(kms, cache);
}

describe("EnvelopeEncryption", () => {
  it("encrypt then decrypt round-trips", async () => {
    const svc = createService();
    await svc.generateOrgKey("org1", "data", "kek-1");
    const ciphertext = await svc.encrypt("org1", "data", "hello secret");
    const plaintext = await svc.decrypt("org1", "data", ciphertext);
    expect(plaintext).toBe("hello secret");
  });

  it("different IVs for same plaintext", async () => {
    const svc = createService();
    await svc.generateOrgKey("org1", "data", "kek-1");
    const c1 = await svc.encrypt("org1", "data", "same");
    const c2 = await svc.encrypt("org1", "data", "same");
    expect(c1).not.toBe(c2);
  });

  it("tampered ciphertext fails decryption", async () => {
    const svc = createService();
    await svc.generateOrgKey("org1", "data", "kek-1");
    const ciphertext = await svc.encrypt("org1", "data", "secret");
    const tampered = ciphertext.slice(0, -2) + "XX";
    await expect(svc.decrypt("org1", "data", tampered)).rejects.toThrow();
  });

  it("deterministic mode produces same ciphertext for same input", async () => {
    const svc = createService();
    await svc.generateOrgKey("org1", "lookup", "kek-1");
    const c1 = await svc.encryptDeterministic("org1", "lookup", "alice@acme.com");
    const c2 = await svc.encryptDeterministic("org1", "lookup", "alice@acme.com");
    expect(c1).toBe(c2);
  });

  it("deterministic mode decrypts correctly", async () => {
    const svc = createService();
    await svc.generateOrgKey("org1", "lookup", "kek-1");
    const ciphertext = await svc.encryptDeterministic("org1", "lookup", "alice@acme.com");
    const plaintext = await svc.decryptDeterministic("org1", "lookup", ciphertext);
    expect(plaintext).toBe("alice@acme.com");
  });

  it("deterministic mode differs with different keys", async () => {
    const svc = createService();
    await svc.generateOrgKey("org1", "lookup", "kek-1");
    await svc.generateOrgKey("org2", "lookup", "kek-2");
    const c1 = await svc.encryptDeterministic("org1", "lookup", "same@email.com");
    const c2 = await svc.encryptDeterministic("org2", "lookup", "same@email.com");
    expect(c1).not.toBe(c2);
  });
});
