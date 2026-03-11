import { verifyRequest, verifyApiKey, extractPrefix } from "@sentinel/auth";
import { isAuthorized, type ApiRole } from "@sentinel/security";
import type { FastifyRequest, FastifyReply } from "fastify";

export async function resolveApiKeyAuth(
  authHeader: string | undefined,
  lookupByPrefix: (prefix: string) => Promise<{ keyHash: string; keySalt: string; orgId: string; role: string; revokedAt: string | null; expiresAt: string | null } | null>,
): Promise<{ orgId: string; role: string } | null> {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer (sk_.+)$/);
  if (!match) return null;

  const key = match[1];
  const prefix = extractPrefix(key);
  const record = await lookupByPrefix(prefix);
  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt && new Date(record.expiresAt) < new Date()) return null;

  const valid = await verifyApiKey(key, record.keyHash, record.keySalt);
  if (!valid) return null;

  return { orgId: record.orgId, role: record.role };
}

interface AuthHookOptions {
  getOrgSecret: (apiKey?: string) => Promise<string | null>;
  resolveRole?: (apiKey?: string) => Promise<ApiRole>;
}

export function createAuthHook(options: AuthHookOptions) {
  return async function authHook(request: FastifyRequest, reply: FastifyReply) {
    // Try API key auth first (Bearer sk_...)
    const authHeader = request.headers.authorization as string | undefined;
    if (authHeader?.startsWith("Bearer sk_")) {
      const apiKeyResult = await resolveApiKeyAuth(authHeader, async (prefix) => {
        const { getDb } = await import("@sentinel/db");
        const db = getDb();
        const apiKey = await db.apiKey.findFirst({ where: { keyPrefix: prefix } });
        if (!apiKey) return null;
        return {
          keyHash: apiKey.keyHash,
          keySalt: apiKey.keySalt,
          orgId: apiKey.orgId,
          role: apiKey.role,
          revokedAt: apiKey.revokedAt?.toISOString() ?? null,
          expiresAt: apiKey.expiresAt?.toISOString() ?? null,
        };
      });
      if (apiKeyResult) {
        (request as any).orgId = apiKeyResult.orgId;
        (request as any).role = apiKeyResult.role as ApiRole;
        // RBAC check
        const rawPath = request.routeOptions?.url ?? request.url;
        const routePath = rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;
        if (!isAuthorized(apiKeyResult.role as ApiRole, request.method, routePath)) {
          reply.code(403).send({ error: "Forbidden: insufficient permissions" });
          return;
        }
        return; // Authenticated via API key
      }
    }

    // Existing HMAC flow
    const signature = request.headers["x-sentinel-signature"] as string | undefined;
    if (!signature) {
      reply.code(401).send({ error: "Missing X-Sentinel-Signature header" });
      return;
    }

    const apiKey = request.headers["x-sentinel-api-key"] as string | undefined;

    const secret = await options.getOrgSecret(apiKey);
    if (!secret) {
      reply.code(401).send({ error: "Invalid API key" });
      return;
    }

    const body = request.body === undefined || request.body === null
      ? ""
      : typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    const result = verifyRequest(signature, body, secret);
    if (!result.valid) {
      reply.code(401).send({ error: `Authentication failed: ${result.reason}` });
      return;
    }

    // Resolve role
    const role: ApiRole = options.resolveRole
      ? await options.resolveRole(apiKey)
      : (request.headers["x-sentinel-role"] as ApiRole) ?? "service";

    // Store on request for downstream use
    (request as any).role = role;

    // Read org from dashboard header
    const orgHeader = request.headers["x-sentinel-org-id"] as string | undefined;
    if (orgHeader) {
      (request as any).orgId = orgHeader;
    }
    (request as any).orgId = (request as any).orgId ?? "default";

    // RBAC check — use Fastify route pattern for matching
    const rawPath = request.routeOptions?.url ?? request.url;
    const routePath = rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;
    if (!isAuthorized(role, request.method, routePath)) {
      reply.code(403).send({ error: "Forbidden: insufficient permissions" });
      return;
    }
  };
}
