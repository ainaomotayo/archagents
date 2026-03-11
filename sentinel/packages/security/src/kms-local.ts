import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import type { KmsProvider } from "./kms-provider.js";

/**
 * Local file-based KMS for development and testing.
 * Uses AES-256-GCM to wrap/unwrap DEKs with a deterministic KEK derived from kekId.
 * NOT for production — use AWS/GCP/Vault backends instead.
 */
export class LocalKmsProvider implements KmsProvider {
  readonly name = "local";
  private readonly masterSecret: Buffer;

  constructor(masterSecret?: string) {
    const secret = masterSecret ?? process.env.SENTINEL_KMS_LOCAL_SECRET ?? "local-dev-kms-secret-do-not-use-in-prod";
    this.masterSecret = createHash("sha256").update(secret).digest();
  }

  private deriveKek(kekId: string): Buffer {
    return createHash("sha256").update(`${this.masterSecret.toString("hex")}:${kekId}`).digest();
  }

  async generateDataKey(kekId: string): Promise<{ plaintext: Buffer; wrapped: Buffer }> {
    const plaintext = randomBytes(32);
    const wrapped = this.wrap(plaintext, this.deriveKek(kekId));
    return { plaintext, wrapped };
  }

  async unwrapDataKey(kekId: string, wrappedDek: Buffer): Promise<Buffer> {
    return this.unwrap(wrappedDek, this.deriveKek(kekId));
  }

  async rewrapDataKey(kekId: string, wrappedDek: Buffer): Promise<Buffer> {
    const plaintext = await this.unwrapDataKey(kekId, wrappedDek);
    return this.wrap(plaintext, this.deriveKek(kekId));
  }

  async ping(): Promise<boolean> {
    return true;
  }

  private wrap(plaintext: Buffer, kek: Buffer): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", kek, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]); // 12 + 16 + 32 = 60 bytes
  }

  private unwrap(wrapped: Buffer, kek: Buffer): Buffer {
    if (wrapped.length < 28) throw new Error("Invalid wrapped DEK: buffer too short");
    const iv = wrapped.subarray(0, 12);
    const authTag = wrapped.subarray(12, 28);
    const encrypted = wrapped.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", kek, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}
