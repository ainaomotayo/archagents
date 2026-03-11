import { describe, it, expect } from "vitest";
import { EnvelopeEncryption, LocalKmsProvider, DekCache } from "@sentinel/security";
import { ENCRYPTED_FIELDS } from "@sentinel/db";

describe("server wiring integration", () => {
  describe("EnvelopeEncryption with LocalKmsProvider", () => {
    it("encrypts and decrypts a string round-trip", async () => {
      const kms = new LocalKmsProvider("test-secret");
      const cache = new DekCache();
      const envelope = new EnvelopeEncryption(kms, cache);
      await envelope.generateOrgKey("org-test", "sso_secrets", "default");

      const plaintext = "my-secret-value";
      const encrypted = await envelope.encrypt("org-test", "sso_secrets", plaintext);
      expect(encrypted).not.toBe(plaintext);

      const decrypted = await envelope.decrypt("org-test", "sso_secrets", encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("deterministic encryption produces same ciphertext for same input", async () => {
      const kms = new LocalKmsProvider("test-secret");
      const cache = new DekCache();
      const envelope = new EnvelopeEncryption(kms, cache);
      await envelope.generateOrgKey("org-test", "user_lookup", "default");

      const ct1 = await envelope.encryptDeterministic("org-test", "user_lookup", "alice@example.com");
      const ct2 = await envelope.encryptDeterministic("org-test", "user_lookup", "alice@example.com");
      expect(ct1).toBe(ct2);
    });

    it("auto-provisions keys via provisioner callback", async () => {
      const kms = new LocalKmsProvider("test-secret");
      const cache = new DekCache();
      const envelope = new EnvelopeEncryption(kms, cache);

      const provisioned: Array<{ orgId: string; purpose: string }> = [];
      envelope.setKeyProvisioner(async (orgId, purpose, _wrappedDek, _kekId) => {
        provisioned.push({ orgId, purpose });
      });
      envelope.setDefaultKekId("default");

      const encrypted = await envelope.encrypt("new-org", "sso_secrets", "secret");
      expect(encrypted).toBeTruthy();
      expect(provisioned).toHaveLength(1);
      expect(provisioned[0]).toEqual({ orgId: "new-org", purpose: "sso_secrets" });
    });

    it("loads keys via loader callback", async () => {
      const kms = new LocalKmsProvider("test-secret");

      // Generate a key and capture the wrapped form
      const { wrapped } = await kms.generateDataKey("default");

      const cache = new DekCache();
      const envelope = new EnvelopeEncryption(kms, cache);

      let loaderCalled = false;
      envelope.setKeyLoader(async (orgId, purpose) => {
        if (orgId === "org-b" && purpose === "sso_secrets") {
          loaderCalled = true;
          return { wrappedDek: wrapped, kekId: "default" };
        }
        return null;
      });

      const encrypted = await envelope.encrypt("org-b", "sso_secrets", "world");
      expect(encrypted).toBeTruthy();
      expect(loaderCalled).toBe(true);

      // Verify decrypt works too
      const decrypted = await envelope.decrypt("org-b", "sso_secrets", encrypted);
      expect(decrypted).toBe("world");
    });
  });

  describe("ENCRYPTED_FIELDS configuration", () => {
    it("has config for SsoConfig with envelope mode", () => {
      expect(ENCRYPTED_FIELDS.SsoConfig).toBeDefined();
      expect(ENCRYPTED_FIELDS.SsoConfig.fields).toContain("clientSecret");
      expect(ENCRYPTED_FIELDS.SsoConfig.fields).toContain("clientId");
      expect(ENCRYPTED_FIELDS.SsoConfig.fields).toContain("scimToken");
      expect(ENCRYPTED_FIELDS.SsoConfig.mode).toBe("envelope");
    });

    it("has config for WebhookEndpoint with envelope mode", () => {
      expect(ENCRYPTED_FIELDS.WebhookEndpoint).toBeDefined();
      expect(ENCRYPTED_FIELDS.WebhookEndpoint.fields).toContain("secret");
      expect(ENCRYPTED_FIELDS.WebhookEndpoint.mode).toBe("envelope");
    });

    it("has config for User with deterministic mode", () => {
      expect(ENCRYPTED_FIELDS.User).toBeDefined();
      expect(ENCRYPTED_FIELDS.User.mode).toBe("deterministic");
      expect(ENCRYPTED_FIELDS.User.fields).toContain("email");
      expect(ENCRYPTED_FIELDS.User.fields).toContain("name");
    });

    it("has config for Certificate with envelope mode", () => {
      expect(ENCRYPTED_FIELDS.Certificate).toBeDefined();
      expect(ENCRYPTED_FIELDS.Certificate.fields).toContain("signature");
      expect(ENCRYPTED_FIELDS.Certificate.mode).toBe("envelope");
    });
  });
});
