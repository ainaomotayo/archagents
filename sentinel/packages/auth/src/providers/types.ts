export type SsoProviderType =
  | "okta"
  | "azure-ad"
  | "google-workspace"
  | "ping-federate"
  | "generic-oidc"
  | "generic-saml";

export interface StandardClaims {
  sub: string;
  email: string;
  name: string;
  groups?: string[];
  picture?: string | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
}

export interface ConnectionTestResult {
  success: boolean;
  latencyMs: number;
  metadata?: { issuer?: string; supportedScopes?: string[] };
  error?: string;
}

export interface SsoConfigInput {
  provider: SsoProviderType;
  clientId: string;
  clientSecret: string;
  issuerUrl?: string;
  tenantId?: string;
  metadataUrl?: string;
  domainRestriction?: string;
  samlMetadata?: string;
}

export interface SsoProvider {
  readonly id: SsoProviderType;
  readonly protocol: "oidc" | "saml";
  readonly displayName: string;

  validateConfig(config: SsoConfigInput): ValidationResult;
  testConnection(config: SsoConfigInput): Promise<ConnectionTestResult>;
  mapClaims(profile: Record<string, unknown>): StandardClaims;
}
