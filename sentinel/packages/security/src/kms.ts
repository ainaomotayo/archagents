import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";

export interface KmsKeyStore {
  getKey(orgId: string): Promise<Buffer | null>;
  storeKey(orgId: string, key: Buffer): Promise<void>;
  destroyKey(orgId: string): Promise<void>;
}

/** Generate a 256-bit random encryption key. */
export function generateEncryptionKey(): Buffer {
  return randomBytes(32);
}

/**
 * Encrypt data using AES-256-GCM.
 * Returns base64-encoded string of: iv (12 bytes) + authTag (16 bytes) + ciphertext.
 */
export function encrypt(data: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(data, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // iv (12) + authTag (16) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

/**
 * Decrypt AES-256-GCM encrypted data.
 * Expects base64-encoded string of: iv (12 bytes) + authTag (16 bytes) + ciphertext.
 */
export function decrypt(encrypted: string, key: Buffer): string {
  const combined = Buffer.from(encrypted, "base64");

  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(12, 28);
  const ciphertext = combined.subarray(28);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * In-memory KMS key store for testing and development.
 */
export class InMemoryKeyStore implements KmsKeyStore {
  private keys = new Map<string, Buffer>();

  async getKey(orgId: string): Promise<Buffer | null> {
    return this.keys.get(orgId) ?? null;
  }

  async storeKey(orgId: string, key: Buffer): Promise<void> {
    this.keys.set(orgId, key);
  }

  async destroyKey(orgId: string): Promise<void> {
    this.keys.delete(orgId);
  }
}
