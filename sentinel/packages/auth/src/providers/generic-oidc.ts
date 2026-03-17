import type {
  SsoProvider,
  SsoConfigInput,
  StandardClaims,
  ValidationResult,
  ConnectionTestResult,
} from "./types.js";

type FetchFn = typeof globalThis.fetch;

export class GenericOidcProvider implements SsoProvider {
  readonly id = "generic-oidc" as const;
  readonly protocol = "oidc" as const;
  readonly displayName = "Generic OIDC";

  private fetchFn: FetchFn;

  constructor(fetchFn?: FetchFn) {
    this.fetchFn = fetchFn ?? globalThis.fetch;
  }

  validateConfig(config: SsoConfigInput): ValidationResult {
    const errors: ValidationResult["errors"] = [];

    if (!config.clientId?.trim()) {
      errors.push({ field: "clientId", message: "Client ID is required" });
    }
    if (!config.clientSecret?.trim()) {
      errors.push({
        field: "clientSecret",
        message: "Client Secret is required",
      });
    }
    if (!config.issuerUrl?.trim()) {
      errors.push({
        field: "issuerUrl",
        message: "Issuer URL is required for OIDC",
      });
    } else if (!config.issuerUrl.startsWith("https://")) {
      errors.push({
        field: "issuerUrl",
        message: "Issuer URL must use HTTPS",
      });
    }

    return { valid: errors.length === 0, errors };
  }

  async testConnection(config: SsoConfigInput): Promise<ConnectionTestResult> {
    const start = Date.now();
    try {
      const url = `${config.issuerUrl}/.well-known/openid-configuration`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await this.fetchFn(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        return {
          success: false,
          latencyMs: Date.now() - start,
          error: `HTTP ${res.status}`,
        };
      }

      const data = (await res.json()) as Record<string, unknown>;
      return {
        success: true,
        latencyMs: Date.now() - start,
        metadata: {
          issuer: data.issuer as string | undefined,
          supportedScopes: data.scopes_supported as string[] | undefined,
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  mapClaims(profile: Record<string, unknown>): StandardClaims {
    const sub = (profile.sub as string) ?? "";
    const email = (profile.email as string) ?? "";
    const name =
      (profile.name as string) ??
      (profile.preferred_username as string) ??
      email;
    const groups = Array.isArray(profile.groups)
      ? (profile.groups as string[])
      : undefined;
    const picture =
      typeof profile.picture === "string" ? profile.picture : undefined;

    return { sub, email, name, groups, picture };
  }
}
