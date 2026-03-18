import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export interface EncryptedData {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

export function encryptCredential(plaintext: string, key: Buffer): EncryptedData {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

export function decryptCredential(data: EncryptedData, key: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, data.iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(data.tag);
  const decrypted = Buffer.concat([decipher.update(data.ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
