import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export async function encryptJwe(payload: Record<string, unknown>, secret: string): Promise<string> {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const plaintext = JSON.stringify(payload);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

export async function decryptJwe(token: string, secret: string): Promise<Record<string, unknown>> {
  const key = deriveKey(secret);
  const buf = Buffer.from(token, "base64url");
  if (buf.length < 29) throw new Error("Invalid JWE token");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext);
}
