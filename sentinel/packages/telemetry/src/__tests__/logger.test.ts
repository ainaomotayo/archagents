import { describe, it, expect } from "vitest";
import { createLogger, withCorrelationId } from "../logger.js";

describe("createLogger", () => {
  it("creates a pino logger with default config", () => {
    const logger = createLogger({ name: "test" });
    expect(logger).toBeDefined();
    expect(logger.level).toBe("info");
  });

  it("respects custom log level", () => {
    const logger = createLogger({ level: "debug" });
    expect(logger.level).toBe("debug");
  });
});

describe("withCorrelationId", () => {
  it("creates child logger with correlationId", () => {
    const parent = createLogger({ name: "test" });
    const child = withCorrelationId(parent, "req-123");
    expect(child).toBeDefined();
    expect((child as any).bindings().correlationId).toBe("req-123");
  });
});
