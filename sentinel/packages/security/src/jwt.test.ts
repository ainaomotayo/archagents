import { describe, it, expect } from "vitest";
import { createSessionToken, verifySessionToken, refreshToken } from "./jwt.js";

const SECRET = "test-secret-key-for-jwt-signing";
const PAYLOAD = { sub: "user-1", org: "org-1", role: "admin" };

describe("jwt", () => {
  it("should create a valid JWT token with 3 parts", () => {
    const token = createSessionToken(PAYLOAD, SECRET);
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
  });

  it("should verify a freshly created token", () => {
    const token = createSessionToken(PAYLOAD, SECRET);
    const result = verifySessionToken(token, SECRET);
    expect(result.valid).toBe(true);
    expect(result.payload?.sub).toBe("user-1");
    expect(result.payload?.org).toBe("org-1");
    expect(result.payload?.role).toBe("admin");
  });

  it("should include iat and exp in the payload", () => {
    const token = createSessionToken(PAYLOAD, SECRET, 600);
    const result = verifySessionToken(token, SECRET);
    expect(result.payload?.iat).toBeTypeOf("number");
    expect(result.payload?.exp).toBeTypeOf("number");
    expect(result.payload!.exp - result.payload!.iat).toBe(600);
  });

  it("should default to 15-minute TTL", () => {
    const token = createSessionToken(PAYLOAD, SECRET);
    const result = verifySessionToken(token, SECRET);
    expect(result.payload!.exp - result.payload!.iat).toBe(900);
  });

  it("should reject an expired token", () => {
    const token = createSessionToken(PAYLOAD, SECRET, -1);
    const result = verifySessionToken(token, SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Token expired");
  });

  it("should reject a tampered token", () => {
    const token = createSessionToken(PAYLOAD, SECRET);
    const parts = token.split(".");
    // Tamper with the payload
    const tampered = `${parts[0]}.${parts[1]}x.${parts[2]}`;
    const result = verifySessionToken(tampered, SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid signature");
  });

  it("should reject a token with wrong secret", () => {
    const token = createSessionToken(PAYLOAD, SECRET);
    const result = verifySessionToken(token, "wrong-secret");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid signature");
  });

  it("should reject a malformed token", () => {
    const result = verifySessionToken("not-a-jwt", SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid token format");
  });

  it("should refresh a valid token with new expiry", () => {
    const token = createSessionToken(PAYLOAD, SECRET, 300);
    const newToken = refreshToken(token, SECRET, 600);
    expect(newToken).not.toBeNull();

    const original = verifySessionToken(token, SECRET);
    const refreshed = verifySessionToken(newToken!, SECRET);
    expect(refreshed.valid).toBe(true);
    expect(refreshed.payload?.sub).toBe("user-1");
    // New token should have longer TTL
    expect(refreshed.payload!.exp - refreshed.payload!.iat).toBe(600);
    expect(original.payload!.exp - original.payload!.iat).toBe(300);
  });

  it("should return null when refreshing an expired token", () => {
    const token = createSessionToken(PAYLOAD, SECRET, -1);
    const result = refreshToken(token, SECRET);
    expect(result).toBeNull();
  });

  it("should allow custom TTL on refresh", () => {
    const token = createSessionToken(PAYLOAD, SECRET);
    const newToken = refreshToken(token, SECRET, 3600);
    const result = verifySessionToken(newToken!, SECRET);
    expect(result.payload!.exp - result.payload!.iat).toBe(3600);
  });
});
