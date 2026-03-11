import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import type { KmsProvider } from "./kms-provider.js";
import type { DekCache } from "./dek-cache.js";

interface OrgKeyRecord {
  orgId: string;
  purpose: string;
  wrappedDek: Buffer;
  kekId: string;
}

export class EnvelopeEncryption {
  private keyRecords = new Map<string, OrgKeyRecord>();

  constructor(
    private kms: KmsProvider,
    private cache: DekCache,
  ) {}

  async generateOrgKey(orgId: string, purpose: string, kekId: string): Promise<void> {
    const { plaintext, wrapped } = await this.kms.generateDataKey(kekId);
    const key = `${orgId}\0${purpose}`;
    this.keyRecords.set(key, { orgId, purpose, wrappedDek: wrapped, kekId });
    this.cache.set(orgId, purpose, plaintext);
  }

  setKeyRecord(orgId: string, purpose: string, wrappedDek: Buffer, kekId: string): void {
    this.keyRecords.set(`${orgId}\0${purpose}`, { orgId, purpose, wrappedDek, kekId });
  }

  private async getDek(orgId: string, purpose: string): Promise<Buffer> {
    const cached = this.cache.get(orgId, purpose);
    if (cached) return cached;

    const record = this.keyRecords.get(`${orgId}\0${purpose}`);
    if (!record) throw new Error(`No encryption key for ${orgId}:${purpose}`);

    const plaintext = await this.kms.unwrapDataKey(record.kekId, record.wrappedDek);
    this.cache.set(orgId, purpose, plaintext);
    return plaintext;
  }

  async encrypt(orgId: string, purpose: string, plaintext: string): Promise<string> {
    const dek = await this.getDek(orgId, purpose);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", dek, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString("base64");
  }

  async decrypt(orgId: string, purpose: string, ciphertext: string): Promise<string> {
    const dek = await this.getDek(orgId, purpose);
    const buf = Buffer.from(ciphertext, "base64");
    if (buf.length < 28) throw new Error("Invalid ciphertext: buffer too short");
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", dek, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }

  async encryptDeterministic(orgId: string, purpose: string, plaintext: string): Promise<string> {
    const dek = await this.getDek(orgId, purpose);
    const iv = createHmac("sha256", dek).update(plaintext).digest().subarray(0, 12);
    const cipher = createCipheriv("aes-256-gcm", dek, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString("base64");
  }

  async decryptDeterministic(orgId: string, purpose: string, ciphertext: string): Promise<string> {
    return this.decrypt(orgId, purpose, ciphertext);
  }
}
