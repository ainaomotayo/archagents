import { describe, it, expect, afterEach } from "vitest";
import { initTracing, shutdownTracing } from "../tracer.js";

describe("tracer", () => {
  afterEach(async () => {
    await shutdownTracing();
  });

  it("initTracing does not throw", () => {
    expect(() =>
      initTracing({ serviceName: "test-service", serviceVersion: "0.0.1" }),
    ).not.toThrow();
  });

  it("initTracing is idempotent (second call is a no-op)", () => {
    initTracing({ serviceName: "test-service" });
    expect(() => initTracing({ serviceName: "test-service" })).not.toThrow();
  });

  it("shutdownTracing is safe to call without init", async () => {
    await expect(shutdownTracing()).resolves.toBeUndefined();
  });

  it("shutdownTracing is safe to call twice", async () => {
    initTracing({ serviceName: "test-service" });
    await shutdownTracing();
    await expect(shutdownTracing()).resolves.toBeUndefined();
  });
});
