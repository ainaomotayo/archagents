import { describe, it, expect } from "vitest";
import { signRequest, verifyRequest } from "./signing.js";

describe("HMAC request signing", () => {
  const secret = "test-secret-key";
  const body = '{"action":"deploy","env":"production"}';

  it("signs a request with HMAC-SHA256", () => {
    const signature = signRequest(body, secret);
    expect(signature).toMatch(/^t=\d+,sig=[a-f0-9]{64}$/);
  });

  it("verifies a valid signature", () => {
    const signature = signRequest(body, secret);
    const result = verifyRequest(signature, body, secret);
    expect(result).toEqual({ valid: true });
  });

  it("rejects tampered body", () => {
    const signature = signRequest(body, secret);
    const result = verifyRequest(signature, "tampered-body", secret);
    expect(result).toEqual({ valid: false, reason: "signature_mismatch" });
  });

  it("rejects expired timestamp (>5 min old)", () => {
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    const signature = signRequest(body, secret, tenMinutesAgo);
    const result = verifyRequest(signature, body, secret);
    expect(result).toEqual({ valid: false, reason: "request_expired" });
  });

  it("rejects invalid signature format", () => {
    const result = verifyRequest("garbage-string", body, secret);
    expect(result).toEqual({ valid: false, reason: "invalid_format" });
  });
});
