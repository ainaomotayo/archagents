import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";

describe("security plugins", () => {
  const app = Fastify();

  beforeAll(async () => {
    await app.register(cors, {
      origin: "http://localhost:3000",
      allowedHeaders: ["Content-Type", "X-Sentinel-Signature"],
    });
    await app.register(helmet, { contentSecurityPolicy: false });
    app.get("/test", async () => ({ ok: true }));
    await app.ready();
  });

  afterAll(() => app.close());

  it("sets security headers", async () => {
    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  it("handles CORS preflight", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/test",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "POST",
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );
  });
});
