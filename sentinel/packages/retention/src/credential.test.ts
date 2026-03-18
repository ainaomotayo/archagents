import { describe, it, expect } from "vitest";
import { encryptCredential, decryptCredential } from "./credential.js";

describe("credential encryption", () => {
  const key = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex");

  it("encrypts and decrypts a secret", () => {
    const secret = "aws-secret-access-key-12345";
    const encrypted = encryptCredential(secret, key);
    expect(encrypted.ciphertext).toBeInstanceOf(Buffer);
    expect(encrypted.iv).toBeInstanceOf(Buffer);
    expect(encrypted.tag).toBeInstanceOf(Buffer);
    expect(encrypted.iv).toHaveLength(12);
    expect(encrypted.tag).toHaveLength(16);
    const decrypted = decryptCredential(encrypted, key);
    expect(decrypted).toBe(secret);
  });

  it("produces different ciphertext for same plaintext (random IV)", () => {
    const secret = "same-secret";
    const a = encryptCredential(secret, key);
    const b = encryptCredential(secret, key);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
    expect(a.iv).not.toEqual(b.iv);
  });

  it("fails decryption with wrong key", () => {
    const secret = "my-secret";
    const encrypted = encryptCredential(secret, key);
    const wrongKey = Buffer.from("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", "hex");
    expect(() => decryptCredential(encrypted, wrongKey)).toThrow();
  });

  it("fails decryption with tampered ciphertext", () => {
    const secret = "my-secret";
    const encrypted = encryptCredential(secret, key);
    encrypted.ciphertext[0] ^= 0xff;
    expect(() => decryptCredential(encrypted, key)).toThrow();
  });
});
