import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import type { Redis } from "ioredis";

export async function registerSecurityPlugins(
  app: FastifyInstance,
  opts: { redis: Redis },
): Promise<void> {
  // CORS
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "X-Sentinel-Signature",
      "X-Sentinel-Api-Key",
      "X-Sentinel-Timestamp",
    ],
    credentials: true,
  });

  // Helmet security headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // API serves JSON, not HTML
    hsts: { maxAge: 31536000, includeSubDomains: true },
  });

  // Rate limiting with Redis backend
  await app.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX ?? "100", 10),
    timeWindow: "1 minute",
    redis: opts.redis,
    keyGenerator: (request) => {
      return (
        (request.headers["x-sentinel-api-key"] as string) ?? request.ip
      );
    },
    errorResponseBuilder: (_request, context) => ({
      error: "Too Many Requests",
      message: `Rate limit exceeded. Retry after ${Math.ceil(context.ttl / 1000)}s`,
      retryAfter: Math.ceil(context.ttl / 1000),
    }),
  });
}
