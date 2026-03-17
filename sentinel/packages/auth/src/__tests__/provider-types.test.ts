import { describe, it, expect } from "vitest";
import type {
  SsoProviderType,
  StandardClaims,
  ValidationResult,
  ConnectionTestResult,
} from "../providers/types.js";

describe("SSO Provider Types", () => {
  it("SsoProviderType includes all 6 supported providers", () => {
    const providers: SsoProviderType[] = [
      "okta",
      "azure-ad",
      "google-workspace",
      "ping-federate",
      "generic-oidc",
      "generic-saml",
    ];
    expect(providers).toHaveLength(6);
    // Each value should be a string (compile-time check ensures valid literals)
    for (const p of providers) {
      expect(typeof p).toBe("string");
    }
  });

  it("StandardClaims has required fields (sub, email, name) and optional groups", () => {
    const claims: StandardClaims = {
      sub: "user-123",
      email: "alice@example.com",
      name: "Alice Smith",
    };
    expect(claims.sub).toBe("user-123");
    expect(claims.email).toBe("alice@example.com");
    expect(claims.name).toBe("Alice Smith");
    expect(claims.groups).toBeUndefined();

    const withGroups: StandardClaims = {
      sub: "user-456",
      email: "bob@example.com",
      name: "Bob Jones",
      groups: ["engineering", "admins"],
    };
    expect(withGroups.groups).toEqual(["engineering", "admins"]);
  });

  it("ValidationResult can indicate valid config", () => {
    const result: ValidationResult = { valid: true, errors: [] };
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("ValidationResult can indicate invalid config with errors", () => {
    const result: ValidationResult = {
      valid: false,
      errors: [
        { field: "clientId", message: "clientId is required" },
        { field: "issuerUrl", message: "issuerUrl must be a valid URL" },
      ],
    };
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toEqual({
      field: "clientId",
      message: "clientId is required",
    });
  });

  it("ConnectionTestResult captures success with metadata", () => {
    const result: ConnectionTestResult = {
      success: true,
      latencyMs: 42,
      metadata: {
        issuer: "https://accounts.google.com",
        supportedScopes: ["openid", "profile", "email"],
      },
    };
    expect(result.success).toBe(true);
    expect(result.latencyMs).toBe(42);
    expect(result.metadata?.issuer).toBe("https://accounts.google.com");
    expect(result.metadata?.supportedScopes).toContain("openid");
  });

  it("ConnectionTestResult captures failure", () => {
    const result: ConnectionTestResult = {
      success: false,
      latencyMs: 5000,
      error: "Connection timed out",
    };
    expect(result.success).toBe(false);
    expect(result.error).toBe("Connection timed out");
    expect(result.metadata).toBeUndefined();
  });
});
