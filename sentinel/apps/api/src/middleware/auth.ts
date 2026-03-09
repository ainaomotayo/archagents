import { verifyRequest } from "@sentinel/auth";
import type { FastifyRequest, FastifyReply } from "fastify";

interface AuthHookOptions {
  getOrgSecret: (apiKey?: string) => Promise<string | null>;
}

export function createAuthHook(options: AuthHookOptions) {
  return async function authHook(request: FastifyRequest, reply: FastifyReply) {
    const signature = request.headers["x-sentinel-signature"] as string | undefined;
    if (!signature) {
      reply.code(401).send({ error: "Missing X-Sentinel-Signature header" });
      return;
    }

    const secret = await options.getOrgSecret(
      request.headers["x-sentinel-api-key"] as string | undefined,
    );
    if (!secret) {
      reply.code(401).send({ error: "Invalid API key" });
      return;
    }

    const body = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    const result = verifyRequest(signature, body, secret);
    if (!result.valid) {
      reply.code(401).send({ error: `Authentication failed: ${result.reason}` });
      return;
    }
  };
}
