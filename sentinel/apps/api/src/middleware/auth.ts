import { verifyRequest } from "@sentinel/auth";
import { isAuthorized, type ApiRole } from "@sentinel/security";
import type { FastifyRequest, FastifyReply } from "fastify";

interface AuthHookOptions {
  getOrgSecret: (apiKey?: string) => Promise<string | null>;
  resolveRole?: (apiKey?: string) => Promise<ApiRole>;
}

export function createAuthHook(options: AuthHookOptions) {
  return async function authHook(request: FastifyRequest, reply: FastifyReply) {
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
