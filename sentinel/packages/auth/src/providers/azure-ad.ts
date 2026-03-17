import type {
  SsoProvider,
  SsoConfigInput,
  StandardClaims,
  ValidationResult,
  ConnectionTestResult,
} from "./types.js";

type FetchFn = typeof globalThis.fetch;

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WELL_KNOWN_TENANTS = new Set(["common", "organizations", "consumers"]);

export class AzureAdProvider implements SsoProvider {
  readonly id = "azure-ad" as const;
  readonly protocol = "oidc" as const;
  readonly displayName = "Microsoft Entra ID";

  private fetchFn: FetchFn;

  constructor(fetchFn?: FetchFn) {
    this.fetchFn = fetchFn ?? globalThis.fetch;
  }

  getIssuerUrl(tenantId: string): string {
    return `https://login.microsoftonline.com/${tenantId}/v2.0`;
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
    if (!config.tenantId?.trim()) {
      errors.push({
        field: "tenantId",
        message: "Tenant ID is required for Azure AD",
      });
    } else if (
      !GUID_RE.test(config.tenantId) &&
      !WELL_KNOWN_TENANTS.has(config.tenantId)
    ) {
      errors.push({
        field: "tenantId",
        message:
          'Tenant ID must be a valid GUID or one of "common", "organizations", "consumers"',
      });
    }

    return { valid: errors.length === 0, errors };
  }

  async testConnection(config: SsoConfigInput): Promise<ConnectionTestResult> {
    const start = Date.now();
    try {
      const issuerUrl = this.getIssuerUrl(config.tenantId!);
      const url = `${issuerUrl}/.well-known/openid-configuration`;
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
    const email =
      (profile.email as string) ??
      (profile.preferred_username as string) ??
      "";
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
