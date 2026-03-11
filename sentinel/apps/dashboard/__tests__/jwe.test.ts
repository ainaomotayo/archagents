import { describe, it, expect } from "vitest";
import { encryptJwe, decryptJwe } from "../lib/jwe.js";

describe("JWE Session Encryption", () => {
  const secret = "test-secret-must-be-at-least-32-chars-long!!";

  it("encrypt then decrypt round-trips", async () => {
    const payload = { sub: "user-1", role: "admin", org: "org-1" };
    const token = await encryptJwe(payload, secret);
    expect(typeof token).toBe("string");
    const decoded = await decryptJwe(token, secret);
    expect(decoded.sub).toBe("user-1");
    expect(decoded.role).toBe("admin");
  });

  it("wrong secret fails to decrypt", async () => {
    const payload = { sub: "user-1" };
    const token = await encryptJwe(payload, secret);
    await expect(decryptJwe(token, "wrong-secret-also-32-chars-long!!!!!")).rejects.toThrow();
  });

  it("tampered token fails to decrypt", async () => {
    const token = await encryptJwe({ sub: "user-1" }, secret);
    const tampered = token.slice(0, -4) + "XXXX";
    await expect(decryptJwe(tampered, secret)).rejects.toThrow();
  });
});
