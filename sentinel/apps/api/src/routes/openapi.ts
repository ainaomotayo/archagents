import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Required top-level fields in an OpenAPI 3.1 spec.
 */
const REQUIRED_TOP_LEVEL = ["openapi", "info", "paths", "components"] as const;

/**
 * Required paths that SENTINEL must expose.
 */
const REQUIRED_PATHS = [
  "/v1/scans",
  "/v1/scans/{id}/poll",
  "/v1/findings",
  "/v1/certificates",
  "/v1/certificates/{id}/revoke",
  "/v1/policies",
  "/v1/policies/{id}",
  "/v1/audit",
  "/health",
] as const;

/**
 * Required component schemas.
 */
const REQUIRED_SCHEMAS = [
  "ScanSubmission",
  "ScanResponse",
  "PollResponse",
  "Finding",
  "Certificate",
  "Assessment",
  "ErrorResponse",
  "HealthResponse",
] as const;

/**
 * Required security schemes.
 */
const REQUIRED_SECURITY_SCHEMES = ["hmacAuth"] as const;

export interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

/**
 * Load and parse the OpenAPI spec from the docs directory.
 * In production this serves the YAML file; for programmatic use
 * we parse it into a JS object (requires a YAML parser).
 */
export function getOpenApiSpecPath(): string {
  return join(__dirname, "../../../../docs/api/openapi.yaml");
}

/**
 * Read the raw OpenAPI YAML as a string.
 */
export function getOpenApiSpecRaw(): string {
  const specPath = getOpenApiSpecPath();
  return readFileSync(specPath, "utf-8");
}

/**
 * Validate that an OpenAPI spec object contains all required SENTINEL paths,
 * schemas, and security schemes.
 */
export function validateOpenApiPaths(spec: OpenApiSpec): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check top-level fields
  for (const field of REQUIRED_TOP_LEVEL) {
    if (!(field in spec)) {
      errors.push(`Missing top-level field: ${field}`);
    }
  }

  // Check openapi version
  if (spec.openapi && !spec.openapi.startsWith("3.1")) {
    errors.push(`Expected OpenAPI 3.1.x, got ${spec.openapi}`);
  }

  // Check required paths
  if (spec.paths) {
    for (const path of REQUIRED_PATHS) {
      if (!(path in spec.paths)) {
        errors.push(`Missing required path: ${path}`);
      }
    }

    // Check that each path has at least one HTTP method
    for (const [path, methods] of Object.entries(spec.paths)) {
      const httpMethods = Object.keys(methods as object).filter((k) =>
        ["get", "post", "put", "delete", "patch"].includes(k)
      );
      if (httpMethods.length === 0) {
        errors.push(`Path ${path} has no HTTP methods defined`);
      }
    }
  }

  // Check required schemas
  if (spec.components?.schemas) {
    for (const schema of REQUIRED_SCHEMAS) {
      if (!(schema in spec.components.schemas)) {
        errors.push(`Missing required schema: ${schema}`);
      }
    }
  } else {
    errors.push("Missing components.schemas");
  }

  // Check security schemes
  if (spec.components?.securitySchemes) {
    for (const scheme of REQUIRED_SECURITY_SCHEMES) {
      if (!(scheme in spec.components.securitySchemes)) {
        errors.push(`Missing required security scheme: ${scheme}`);
      }
    }
  } else {
    errors.push("Missing components.securitySchemes");
  }

  // Check that secured paths reference security
  if (spec.paths) {
    const securedPaths = REQUIRED_PATHS.filter((p) => p !== "/health");
    for (const path of securedPaths) {
      const pathObj = spec.paths[path];
      if (!pathObj) continue;
      for (const [method, operation] of Object.entries(
        pathObj as Record<string, Record<string, unknown>>
      )) {
        if (!["get", "post", "put", "delete", "patch"].includes(method))
          continue;
        if (
          !operation.security ||
          !Array.isArray(operation.security) ||
          operation.security.length === 0
        ) {
          errors.push(
            `Path ${path} ${method.toUpperCase()} is missing security requirement`
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
