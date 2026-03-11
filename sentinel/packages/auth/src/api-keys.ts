import { randomBytes, pbkdf2, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);
const ITERATIONS = 200_000;
const KEY_LENGTH = 64;
const DIGEST = "sha256";
const SALT_BYTES = 16;

export function generateApiKey(): string {
  const bytes = randomBytes(32);
  return `sk_${bytes.toString("base64url")}`;
}

export function extractPrefix(key: string): string {
  return key.slice(0, 8);
}

export async function hashApiKey(key: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derived = await pbkdf2Async(key, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  return { hash: derived.toString("hex"), salt };
}

export async function verifyApiKey(key: string, storedHash: string, storedSalt: string): Promise<boolean> {
  const derived = await pbkdf2Async(key, storedSalt, ITERATIONS, KEY_LENGTH, DIGEST);
  const expected = Buffer.from(storedHash, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
