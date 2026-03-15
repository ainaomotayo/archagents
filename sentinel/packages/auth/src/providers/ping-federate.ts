import type {
  SsoProvider,
  SsoConfigInput,
  StandardClaims,
  ValidationResult,
  ConnectionTestResult,
} from "./types.js";

type FetchFn = typeof globalThis.fetch;

const SAML_NAME_CLAIM =
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name";

export class PingFederateProvider implements SsoProvider {
  readonly id = "ping-federate" as const;
  readonly protocol = "saml" as const;
  readonly displayName = "PingFederate";

  private fetchFn: FetchFn;

  constructor(fetchFn?: FetchFn) {
    this.fetchFn = fetchFn ?? globalThis.fetch;
  }

  validateConfig(config: SsoConfigInput): ValidationResult {
    const errors: ValidationResult["errors"] = [];

    if (!config.clientId?.trim()) {
      errors.push({ field: "clientId", message: "Entity ID is required" });
    }

    const hasMetadataUrl = !!config.metadataUrl?.trim();
    const hasSamlMetadata = !!config.samlMetadata?.trim();

    if (!hasMetadataUrl && !hasSamlMetadata) {
      errors.push({
        field: "metadataUrl",
        message:
          "Either Metadata URL or SAML Metadata XML is required",
      });
    }

    if (hasMetadataUrl && !config.metadataUrl!.startsWith("https://")) {
      errors.push({
        field: "metadataUrl",
        message: "Metadata URL must use HTTPS",
      });
    }

    return { valid: errors.length === 0, errors };
  }

  async testConnection(config: SsoConfigInput): Promise<ConnectionTestResult> {
    const start = Date.now();
    try {
      let xml: string;

      if (config.metadataUrl?.trim()) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        const res = await this.fetchFn(config.metadataUrl, {
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
          return {
            success: false,
            latencyMs: Date.now() - start,
            error: `HTTP ${res.status}`,
          };
        }

        xml = await res.text();
      } else if (config.samlMetadata?.trim()) {
        xml = config.samlMetadata;
      } else {
        return {
          success: false,
          latencyMs: Date.now() - start,
          error: "No metadata source configured",
        };
      }

      const entityIdMatch = xml.match(/entityID=['"]([^'"]+)['"]/);
      const entityId = entityIdMatch?.[1];

      return {
        success: true,
        latencyMs: Date.now() - start,
        metadata: {
          issuer: entityId,
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
    const sub =
      (profile.sub as string) ?? (profile.nameID as string) ?? "";
    const email = (profile.email as string) ?? "";
    const name =
      (profile.name as string) ??
      (profile[SAML_NAME_CLAIM] as string) ??
      email;
    const groups = Array.isArray(profile.memberOf)
      ? (profile.memberOf as string[])
      : undefined;

    return { sub, email, name, ...(groups ? { groups } : {}) };
  }
}
