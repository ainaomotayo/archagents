import { describe, test, expect } from "vitest";
import { ProviderHealthMonitor } from "../provider-health.js";

describe("ProviderHealthMonitor", () => {
  test("returns healthy with score 1.0 for unknown provider", () => {
    const monitor = new ProviderHealthMonitor();
    const health = monitor.getHealth("github");
    expect(health.score).toBe(1.0);
    expect(health.status).toBe("healthy");
  });

  test("score stays high after consecutive successes", () => {
    const monitor = new ProviderHealthMonitor();
    monitor.recordSuccess("github");
    monitor.recordSuccess("github");
    monitor.recordSuccess("github");
    const health = monitor.getHealth("github");
    expect(health.score).toBeGreaterThan(0.9);
    expect(health.status).toBe("healthy");
  });

  test("score drops to degraded after failures", () => {
    const monitor = new ProviderHealthMonitor();
    monitor.recordSuccess("oidc");
    monitor.recordSuccess("oidc");
    monitor.recordFailure("oidc");
    monitor.recordFailure("oidc");
    monitor.recordFailure("oidc");
    const health = monitor.getHealth("oidc");
    expect(health.score).toBeLessThan(0.7);
    expect(health.status).toBe("degraded");
  });

  test("score drops to down after many consecutive failures", () => {
    const monitor = new ProviderHealthMonitor();
    for (let i = 0; i < 10; i++) monitor.recordFailure("saml");
    const health = monitor.getHealth("saml");
    expect(health.score).toBeLessThan(0.3);
    expect(health.status).toBe("down");
  });

  test("getAll returns all tracked providers", () => {
    const monitor = new ProviderHealthMonitor();
    monitor.recordSuccess("github");
    monitor.recordFailure("oidc");
    const all = monitor.getAll();
    expect(Object.keys(all)).toContain("github");
    expect(Object.keys(all)).toContain("oidc");
    expect(all.github.status).toBe("healthy");
  });
});
