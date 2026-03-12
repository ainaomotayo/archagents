import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getOpenApiSpecPath,
  getOpenApiSpecRaw,
  validateOpenApiPaths,
  type OpenApiSpec,
} from "./openapi.js";

// Simple YAML-to-object parser for test purposes (handles the subset we need).
// In production you would use a real YAML parser; here we parse the raw file
// and validate structural properties of the YAML text.

function parseYamlLite(yaml: string): OpenApiSpec {
  // We use a line-based approach to extract key structural elements.
  // This is intentionally minimal -- just enough to power the validator tests.
  const spec: Record<string, unknown> = {};

  // Extract openapi version
  const versionMatch = yaml.match(/^openapi:\s*"([^"]+)"/m);
  if (versionMatch) spec.openapi = versionMatch[1];

  // Extract info
  const titleMatch = yaml.match(/^\s+title:\s*(.+)$/m);
  const apiVersionMatch = yaml.match(
    /^\s+version:\s*"([^"]+)"/m
  );
  if (titleMatch || apiVersionMatch) {
    spec.info = {
      title: titleMatch?.[1]?.trim() ?? "",
      version: apiVersionMatch?.[1] ?? "",
    };
  }

  // Extract paths
  const paths: Record<string, Record<string, unknown>> = {};
  const pathRegex = /^  (\/[^\s:]+):\s*$/gm;
  let match;
  while ((match = pathRegex.exec(yaml)) !== null) {
    const pathName = match[1];
    paths[pathName] = {};

    // Find HTTP methods under this path
    const pathIdx = match.index + match[0].length;
    const nextPathMatch = yaml.indexOf("\n  /", pathIdx);
    const pathBlock = yaml.slice(
      pathIdx,
      nextPathMatch > -1 ? nextPathMatch : undefined
    );

    const methodRegex = /^\s{4}(get|post|put|delete|patch):\s*$/gm;
    let methodMatch;
    while ((methodMatch = methodRegex.exec(pathBlock)) !== null) {
      const method = methodMatch[1];
      const methodIdx = methodMatch.index + methodMatch[0].length;
      const nextMethodMatch = pathBlock.indexOf(
        "\n    ",
        methodIdx + 1
      );
      const methodBlockEnd =
        nextMethodMatch > -1
          ? (() => {
              // Find next method or end of path block
              const rest = pathBlock.slice(methodIdx);
              const nextM = rest.search(/\n\s{4}(get|post|put|delete|patch):/);
              return nextM > -1 ? methodIdx + nextM : pathBlock.length;
            })()
          : pathBlock.length;
      const methodBlock = pathBlock.slice(methodIdx, methodBlockEnd);

      const hasSecurity = methodBlock.includes("security:");
      const securityArr = hasSecurity ? [{ hmacAuth: [] }] : undefined;

      paths[pathName][method] = {
        summary: "",
        ...(securityArr ? { security: securityArr } : {}),
      };
    }
  }
  spec.paths = paths;

  // Extract component schemas
  const schemas: Record<string, unknown> = {};
  const schemaRegex = /^\s{4}(\w+):\s*$/gm;
  const schemasSection = yaml.indexOf("\n  schemas:");
  const secSchemesSection = yaml.indexOf("\n  securitySchemes:");
  if (schemasSection > -1) {
    const schemasBlock = yaml.slice(
      schemasSection,
      secSchemesSection > schemasSection ? secSchemesSection : undefined
    );
    let sMatch;
    while ((sMatch = schemaRegex.exec(schemasBlock)) !== null) {
      schemas[sMatch[1]] = { type: "object" };
    }
  }

  // Extract security schemes
  const securitySchemes: Record<string, unknown> = {};
  if (secSchemesSection > -1) {
    const secBlock = yaml.slice(secSchemesSection);
    const secSchemeRegex = /^\s{4}(\w+):\s*$/gm;
    let ssMatch;
    while ((ssMatch = secSchemeRegex.exec(secBlock)) !== null) {
      securitySchemes[ssMatch[1]] = { type: "apiKey" };
    }
  }

  spec.components = { schemas, securitySchemes };

  return spec as unknown as OpenApiSpec;
}

describe("OpenAPI spec file", () => {
  it("spec file exists and is readable", () => {
    const raw = getOpenApiSpecRaw();
    expect(raw).toBeTruthy();
    expect(raw.length).toBeGreaterThan(100);
  });

  it("spec path points to docs/api/openapi.yaml", () => {
    const p = getOpenApiSpecPath();
    expect(p).toContain("docs/api/openapi.yaml");
  });

  it("spec declares OpenAPI 3.1", () => {
    const raw = getOpenApiSpecRaw();
    expect(raw).toMatch(/^openapi:\s*"3\.1/m);
  });

  it("spec has SENTINEL API title", () => {
    const raw = getOpenApiSpecRaw();
    expect(raw).toMatch(/title:\s*SENTINEL API/);
  });
});

describe("OpenAPI spec structure (parsed)", () => {
  let spec: OpenApiSpec;

  // Parse once for all tests in this group
  const raw = getOpenApiSpecRaw();
  spec = parseYamlLite(raw);

  it("has all required top-level fields", () => {
    expect(spec.openapi).toBeDefined();
    expect(spec.info).toBeDefined();
    expect(spec.paths).toBeDefined();
    expect(spec.components).toBeDefined();
  });

  it("contains all required API paths", () => {
    const requiredPaths = [
      "/v1/scans",
      "/v1/scans/{id}",
      "/v1/scans/{id}/poll",
      "/v1/findings",
      "/v1/findings/{id}",
      "/v1/certificates",
      "/v1/certificates/{id}",
      "/v1/certificates/{id}/verify",
      "/v1/certificates/{id}/revoke",
      "/v1/projects",
      "/v1/projects/{id}",
      "/v1/projects/{id}/findings",
      "/v1/policies",
      "/v1/policies/{id}",
      "/v1/policies/{id}/versions",
      "/v1/audit",
      "/v1/admin/dlq",
      "/v1/compliance/frameworks",
      "/v1/compliance/frameworks/{id}",
      "/v1/compliance/controls/{id}/override",
      "/v1/compliance/assess/{frameworkId}",
      "/v1/compliance/scores",
      "/v1/compliance/trends/{frameworkId}",
      "/v1/evidence",
      "/v1/evidence/{id}",
      "/v1/evidence/verify",
      "/v1/reports",
      "/v1/reports/{id}",
      "/v1/webhooks",
      "/v1/webhooks/{id}",
      "/v1/webhooks/{id}/deliveries",
      "/v1/webhooks/{id}/test",
      "/v1/notifications/rules",
      "/v1/notifications/rules/{id}",
      "/v1/events/stream",
      "/webhooks/github",
      "/v1/api-keys",
      "/v1/api-keys/{id}",
      "/v1/sso-configs",
      "/v1/sso-configs/{id}",
      "/v1/sso-configs/{id}/scim-token",
      "/v1/memberships",
      "/v1/memberships/{id}",
      "/v1/scim/v2/ServiceProviderConfig",
      "/v1/scim/v2/Schemas",
      "/v1/scim/v2/ResourceTypes",
      "/v1/scim/v2/Users",
      "/v1/scim/v2/Users/{id}",
      "/v1/scim/v2/Groups",
      "/v1/scim/v2/Groups/{id}",
      "/v1/domains",
      "/v1/domains/{domain}/verify",
      "/v1/domains/{domain}",
      "/v1/admin/rotate-keys",
      "/v1/admin/crypto-shred",
      "/v1/auth/discovery",
      "/v1/saml/metadata",
      "/health",
      "/metrics",
    ];
    for (const path of requiredPaths) {
      expect(spec.paths).toHaveProperty(path);
    }
  });

  it("contains required schemas", () => {
    const requiredSchemas = [
      "ScanSubmission",
      "ScanResponse",
      "PollResponse",
      "Finding",
      "Certificate",
      "Assessment",
      "CategoryScore",
      "Policy",
      "PolicyInput",
      "AuditEvent",
      "HealthResponse",
      "ScanRecord",
      "Project",
      "ProjectDetail",
      "ErrorResponse",
      "EvidenceRecord",
      "ReportRequest",
      "Report",
      "ComplianceFramework",
      "ComplianceFrameworkInput",
      "ComplianceAssessment",
      "ComplianceSnapshot",
      "PolicyVersion",
      "WebhookInput",
      "WebhookEndpoint",
      "WebhookDelivery",
      "NotificationRuleInput",
      "NotificationRule",
      "ApiKeyCreated",
      "ApiKey",
      "SsoConfig",
      "SsoConfigInput",
      "Membership",
      "ScimServiceProviderConfig",
      "ScimUser",
      "ScimUserInput",
      "ScimGroup",
      "ScimGroupInput",
      "ScimPatchOp",
      "ScimError",
      "ScimListResponse",
    ];
    for (const schema of requiredSchemas) {
      expect(spec.components.schemas).toHaveProperty(schema);
    }
  });

  it("contains hmacAuth security scheme", () => {
    expect(spec.components.securitySchemes).toHaveProperty("hmacAuth");
  });

  it("contains scimBearerAuth security scheme", () => {
    expect(spec.components.securitySchemes).toHaveProperty("scimBearerAuth");
  });

  it("passes full validation", () => {
    const result = validateOpenApiPaths(spec);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe("validateOpenApiPaths", () => {
  it("reports missing top-level fields", () => {
    const result = validateOpenApiPaths({} as OpenApiSpec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing top-level field: openapi");
    expect(result.errors).toContain("Missing top-level field: paths");
  });

  it("reports wrong OpenAPI version", () => {
    const result = validateOpenApiPaths({
      openapi: "2.0.0",
      info: { title: "Test", version: "1.0" },
      paths: {},
      components: { schemas: {} },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Expected OpenAPI 3.1"))).toBe(
      true
    );
  });

  it("reports missing required paths", () => {
    const result = validateOpenApiPaths({
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0" },
      paths: { "/health": { get: { security: [{ hmacAuth: [] }] } } },
      components: {
        schemas: {},
        securitySchemes: { hmacAuth: {} },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("/v1/scans"))).toBe(true);
  });

  it("reports missing schemas", () => {
    const result = validateOpenApiPaths({
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0" },
      paths: {},
      components: { schemas: {}, securitySchemes: { hmacAuth: {} } },
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("Missing required schema"))
    ).toBe(true);
  });

  it("reports missing security schemes", () => {
    const result = validateOpenApiPaths({
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0" },
      paths: {},
      components: { schemas: {} },
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("Missing components.securitySchemes"))
    ).toBe(true);
  });
});
